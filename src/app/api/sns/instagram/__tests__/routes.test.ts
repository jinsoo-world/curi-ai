// /api/sns/instagram/* — 시작(웹·앱), 콜백(웹·앱), 앱 마무리, 끊기, 메타 해제·삭제 콜백, 「내 SNS」 칸 상태
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createHmac, createHash, randomBytes } from 'crypto'
import { makeFakeDb, type FakeDb } from '@/domains/os/feeds/__tests__/fake-db'
import { IG_TABLE } from '@/domains/os/instagram/store'

let user: { id: string } | null = { id: 'u-owner' }
let fake: FakeDb
const usedNonces = new Set<string>()
let rlAllowed = true

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }))
vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
        ...fake.db,
        storage: (fake.db as unknown as { storage: unknown }).storage,
        from: (t: string) => {
            if (t === 'connector_app_nonces') {
                return { insert: async (r: { nonce: string }) => usedNonces.has(r.nonce) ? { error: { code: '23505', message: 'dup' } } : (usedNonces.add(r.nonce), { error: null }) }
            }
            return fake.db.from(t)
        },
    }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: rlAllowed, remaining: 1 }), rateLimitMessage: () => '잠시 뒤' }))

const connect = await import('@/app/api/sns/instagram/connect/route')
const { GET: callback } = await import('@/app/api/sns/instagram/callback/route')
const { POST: finish } = await import('@/app/api/sns/instagram/finish/route')
const { POST: deauthorize } = await import('@/app/api/sns/instagram/deauthorize/route')
const deletion = await import('@/app/api/sns/instagram/data-deletion/route')
const snsRoute = await import('@/app/api/os/team/[id]/sns/route')

const APP_SECRET = 'meta-app-secret'
const ENV = {
    INSTAGRAM_APP_ID: '123', INSTAGRAM_APP_SECRET: APP_SECRET, INSTAGRAM_REDIRECT_URI: 'https://www.curi-ai.com/api/sns/instagram/callback',
    CONNECTOR_SECRET_KEY: randomBytes(32).toString('base64'), NEXT_PUBLIC_APP_URL: 'https://www.curi-ai.com',
}
const req = (url: string, init?: RequestInit) => new NextRequest(new URL(url, 'https://www.curi-ai.com'), init as ConstructorParameters<typeof NextRequest>[1])
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status })

function metaFetch(accountType = 'MEDIA_CREATOR') {
    return vi.fn(async (input: string | URL) => {
        const u = new URL(String(input))
        if (u.hostname === 'api.instagram.com') return json({ access_token: 'SHORT', user_id: 777 })
        if (u.pathname === '/access_token') return json({ access_token: 'LONG-TOKEN', expires_in: 5184000 })
        if (u.pathname === '/me') return json({ id: '777', user_id: '17841400000', username: 'jin.ceo', account_type: accountType })
        return json({}, 404)
    })
}

function stateFrom(location: string | null): string {
    return new URL(String(location)).searchParams.get('state') ?? ''
}

beforeEach(() => {
    user = { id: 'u-owner' }
    rlAllowed = true
    usedNonces.clear()
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
    fake = makeFakeDb({
        team_bots: [{ id: 'tb-mine', user_id: 'u-owner', mentor_id: 'm-1' }, { id: 'tb-fan', user_id: 'u-fan', mentor_id: 'm-1' }],
        mentors: [{ id: 'm-1', creator_id: 'cp-1', links: [] }],
        creator_profiles: [{ id: 'cp-1', user_id: 'u-owner' }],
        knowledge_feeds: [], knowledge_sources: [], knowledge_chunks: [],
        connector_app_pending: [], [IG_TABLE]: [], instagram_deletion_requests: [], instagram_learned_sources: [],
        subscriptions: [],
    })
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('시작 GET/POST /api/sns/instagram/connect', () => {
    it('앱 설정이 없으면 503 「곧 열려요」', async () => {
        vi.stubEnv('INSTAGRAM_APP_SECRET', '')
        const r = await connect.GET(req('/api/sns/instagram/connect?mentorId=m-1'))
        expect(r.status).toBe(503)
        expect(await r.json()).toMatchObject({ error: '곧 열려요' })
    })
    it('손님은 로그인으로, 주인 아니면 403', async () => {
        user = null
        expect((await connect.GET(req('/api/sns/instagram/connect?mentorId=m-1'))).headers.get('location')).toContain('/login')
        expect((await connect.POST(req('/api/sns/instagram/connect', { method: 'POST', body: '{}' }))).status).toBe(401)
        user = { id: 'u-fan' }
        expect((await connect.GET(req('/api/sns/instagram/connect?mentorId=m-1'))).status).toBe(403)
        expect((await connect.GET(req('/api/sns/instagram/connect?teamBotId=tb-fan'))).status).toBe(403)
    })
    it('주인은 인스타그램 로그인으로 (권한 instagram_business_basic 하나)', async () => {
        const r = await connect.GET(req('/api/sns/instagram/connect?mentorId=m-1'))
        expect(r.status).toBe(307)
        const to = new URL(String(r.headers.get('location')))
        expect(to.origin + to.pathname).toBe('https://www.instagram.com/oauth/authorize')
        expect(to.searchParams.get('scope')).toBe('instagram_business_basic')
        expect(stateFrom(to.toString()).startsWith('ig.')).toBe(true)
    })
    it('앱: appProof 없으면 400, 있으면 { url }', async () => {
        expect((await connect.POST(req('/api/sns/instagram/connect', { method: 'POST', body: JSON.stringify({ teamBotId: 'tb-mine' }) }))).status).toBe(400)
        const r = await connect.POST(req('/api/sns/instagram/connect', { method: 'POST', body: JSON.stringify({ teamBotId: 'tb-mine', appProof: 'a'.repeat(64) }) }))
        expect(r.status).toBe(200)
        expect((await r.json()).url).toContain('https://www.instagram.com/oauth/authorize')
    })
    it('횟수 제한 429', async () => {
        rlAllowed = false
        expect((await connect.GET(req('/api/sns/instagram/connect?mentorId=m-1'))).status).toBe(429)
    })
})

describe('콜백 GET /api/sns/instagram/callback (웹)', () => {
    async function webState() {
        return stateFrom((await connect.GET(req('/api/sns/instagram/connect?mentorId=m-1'))).headers.get('location'))
    }
    it('성공: 열쇠를 잠가 저장하고 설정 화면으로', async () => {
        vi.stubGlobal('fetch', metaFetch())
        const st = await webState()
        const r = await callback(req(`/api/sns/instagram/callback?code=CODE%23_&state=${encodeURIComponent(st)}`))
        expect(r.headers.get('location')).toBe('https://www.curi-ai.com/os/settings?sns=instagram&result=connected')
        const row = fake.tables[IG_TABLE][0]
        expect(row).toMatchObject({ mentor_id: 'm-1', user_id: 'u-owner', username: 'jin.ceo', status: 'connected' })
        expect(JSON.stringify(fake.tables)).not.toContain('LONG-TOKEN')
        expect(fake.tables.knowledge_feeds[0]).toMatchObject({ sns_slot: 'instagram', kind: 'instagram' })
    })
    it('같은 state 두 번째는 거절, 다른 사람이 마무리하면 거절, 틀린 state 거절', async () => {
        vi.stubGlobal('fetch', metaFetch())
        const st = await webState()
        await callback(req(`/api/sns/instagram/callback?code=C&state=${encodeURIComponent(st)}`))
        expect((await callback(req(`/api/sns/instagram/callback?code=C&state=${encodeURIComponent(st)}`))).headers.get('location')).toContain('reason=bad_state')
        const st2 = await webState()
        user = { id: 'u-other' }
        expect((await callback(req(`/api/sns/instagram/callback?code=C&state=${encodeURIComponent(st2)}`))).headers.get('location')).toContain('reason=bad_state')
        expect((await callback(req('/api/sns/instagram/callback?code=C&state=ig.x.y'))).headers.get('location')).toContain('reason=bad_state')
    })
    it('허용 안 함, 개인 계정, 교환 실패는 이유 코드만', async () => {
        vi.stubGlobal('fetch', metaFetch('PERSONAL'))
        expect((await callback(req(`/api/sns/instagram/callback?error=access_denied&state=${encodeURIComponent(await webState())}`))).headers.get('location')).toContain('reason=denied')
        expect((await callback(req(`/api/sns/instagram/callback?code=C&state=${encodeURIComponent(await webState())}`))).headers.get('location')).toContain('reason=not_professional')
        vi.stubGlobal('fetch', vi.fn(async () => json({ error_message: 'bad' }, 400)))
        const loc = String((await callback(req(`/api/sns/instagram/callback?code=C&state=${encodeURIComponent(await webState())}`))).headers.get('location'))
        expect(loc).toContain('reason=token')
        expect(fake.tables[IG_TABLE]).toHaveLength(0)
    })
})

describe('앱 연결: 콜백 → 딥링크 handoff → POST finish', () => {
    const secret = randomBytes(32).toString('base64url')
    const proof = createHash('sha256').update(secret).digest('hex')
    async function appState() {
        const r = await connect.POST(req('/api/sns/instagram/connect', { method: 'POST', body: JSON.stringify({ teamBotId: 'tb-mine', appProof: proof }) }))
        return stateFrom((await r.json()).url)
    }
    it('콜백은 바로 저장하지 않고 handoff 만 딥링크로. 비밀값 원문이 맞아야 저장', async () => {
        vi.stubGlobal('fetch', metaFetch())
        const st = await appState()
        user = null          // 시스템 브라우저에는 로그인이 없다
        const loc = String((await callback(req(`/api/sns/instagram/callback?code=C&state=${encodeURIComponent(st)}`))).headers.get('location'))
        expect(loc.startsWith('curiai://connect?')).toBe(true)
        expect(loc).not.toContain('LONG-TOKEN')
        const handoff = new URL(loc).searchParams.get('handoff')!
        expect(new URL(loc).searchParams.get('provider')).toBe('instagram')
        expect(fake.tables[IG_TABLE]).toHaveLength(0)

        user = { id: 'u-owner' }
        expect((await finish(req('/api/sns/instagram/finish', { method: 'POST', body: JSON.stringify({ handoff, appSecret: randomBytes(32).toString('base64url') }) }))).status).toBe(400)
        // 틀린 비밀값으로 한 번 꺼내면 행이 지워져 다시 못 쓴다 → 새로 시작
        vi.stubGlobal('fetch', metaFetch())
        const st2 = await appState()
        const loc2 = String((await callback(req(`/api/sns/instagram/callback?code=C&state=${encodeURIComponent(st2)}`))).headers.get('location'))
        const h2 = new URL(loc2).searchParams.get('handoff')!
        const ok = await finish(req('/api/sns/instagram/finish', { method: 'POST', body: JSON.stringify({ handoff: h2, appSecret: secret }) }))
        expect(ok.status).toBe(200)
        expect(await ok.json()).toEqual({ connected: 'instagram', username: 'jin.ceo' })
        expect(fake.tables[IG_TABLE][0]).toMatchObject({ mentor_id: 'm-1', status: 'connected' })
        expect((await finish(req('/api/sns/instagram/finish', { method: 'POST', body: JSON.stringify({ handoff: h2, appSecret: secret }) }))).status).toBe(400)
    })
    it('앱 콜백 실패는 curiai://connect?error=…&provider=instagram', async () => {
        const st = await appState()
        const loc = String((await callback(req(`/api/sns/instagram/callback?error=access_denied&state=${encodeURIComponent(st)}`))).headers.get('location'))
        expect(loc).toBe('curiai://connect?error=denied&provider=instagram')
    })
    it('finish: 앱 설정이 없으면 503', async () => {
        vi.stubEnv('INSTAGRAM_APP_ID', '')
        expect((await finish(req('/api/sns/instagram/finish', { method: 'POST', body: JSON.stringify({ handoff: 'x', appSecret: secret }) }))).status).toBe(503)
    })
    it('finish: 손님 401, 다른 사람 400', async () => {
        user = null
        expect((await finish(req('/api/sns/instagram/finish', { method: 'POST', body: '{}' }))).status).toBe(401)
        user = { id: 'u-fan' }
        expect((await finish(req('/api/sns/instagram/finish', { method: 'POST', body: JSON.stringify({ handoff: 'x', appSecret: secret }) }))).status).toBe(400)
    })
})

describe('「내 SNS」 칸 상태와 끊기', () => {
    async function connectWeb() {
        vi.stubGlobal('fetch', metaFetch())
        const st = stateFrom((await connect.GET(req('/api/sns/instagram/connect?mentorId=m-1'))).headers.get('location'))
        await callback(req(`/api/sns/instagram/callback?code=C&state=${encodeURIComponent(st)}`))
    }
    const ctx = { params: Promise.resolve({ id: 'tb-mine' }) }
    it('기능이 켜지면 연결 버튼, 연결 후 @아이디·배우기, 끊으면 다시 빈 칸(배운 글은 남음)', async () => {
        let d = await (await snsRoute.GET(new Request('https://x'), ctx)).json()
        expect(d.accounts[0]).toMatchObject({ slot: 'instagram', status: 'empty', canConnect: true, connected: false, canLearn: false })
        await connectWeb()
        d = await (await snsRoute.GET(new Request('https://x'), ctx)).json()
        expect(d.accounts[0]).toMatchObject({ status: 'ready', connected: true, username: 'jin.ceo', canLearn: true, url: 'https://www.instagram.com/jin.ceo/' })
        fake.tables.knowledge_sources.push({ id: 's1', mentor_id: 'm-1', feed_id: fake.tables.knowledge_feeds[0].id, title: '[인스타그램] 글', original_url: 'https://www.instagram.com/p/A/' })

        const del = await connect.DELETE(req('/api/sns/instagram/connect?teamBotId=tb-mine', { method: 'DELETE' }))
        expect(del.status).toBe(200)
        const after = await del.json()
        expect(after.accounts[0]).toMatchObject({ status: 'empty', connected: false, learnedCount: 1 })
        expect(fake.tables.knowledge_sources).toHaveLength(1)
        expect(fake.tables[IG_TABLE][0].token_encrypted).toBeNull()
    })
    it('다시 연결 필요 상태', async () => {
        await connectWeb()
        fake.tables[IG_TABLE][0].status = 'needs_reconnect'
        const d = await (await snsRoute.GET(new Request('https://x'), ctx)).json()
        expect(d.accounts[0]).toMatchObject({ status: 'needs_reconnect', needsReconnect: true, canLearn: false, username: 'jin.ceo' })
    })
    it('주소 칸 저장(인스타그램 주소 지우기)은 로그인 연결을 끊지 않는다', async () => {
        await connectWeb()
        const r = await snsRoute.PUT(new Request('https://x', { method: 'PUT', body: JSON.stringify({ instagram: null }) }), ctx)
        expect(r.status).toBe(200)
        expect(fake.tables.knowledge_feeds.filter(f => f.sns_slot === 'instagram')).toHaveLength(1)
        expect(fake.tables[IG_TABLE][0].status).toBe('connected')
    })
    it('끊기: 주인 아니면 403', async () => {
        user = { id: 'u-fan' }
        expect((await connect.DELETE(req('/api/sns/instagram/connect?teamBotId=tb-fan', { method: 'DELETE' }))).status).toBe(403)
    })
})

describe('메타 콜백 (signed_request)', () => {
    const signed = (payload: object, secret = APP_SECRET) => {
        const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
        return `${createHmac('sha256', secret).update(body).digest('base64url')}.${body}`
    }
    const form = (sr: string) => ({ method: 'POST', body: `signed_request=${encodeURIComponent(sr)}`, headers: { 'content-type': 'application/x-www-form-urlencoded' } })
    async function seed() {
        vi.stubGlobal('fetch', metaFetch())
        const st = stateFrom((await connect.GET(req('/api/sns/instagram/connect?mentorId=m-1'))).headers.get('location'))
        await callback(req(`/api/sns/instagram/callback?code=C&state=${encodeURIComponent(st)}`))
    }

    it('서명이 틀리면 400', async () => {
        expect((await deauthorize(req('/api/sns/instagram/deauthorize', form(signed({ algorithm: 'HMAC-SHA256', user_id: '777' }, 'wrong'))))).status).toBe(400)
        expect((await deletion.POST(req('/api/sns/instagram/data-deletion', form('nope')))).status).toBe(400)
    })
    it('해제: 열쇠를 지운다', async () => {
        await seed()
        const r = await deauthorize(req('/api/sns/instagram/deauthorize', form(signed({ algorithm: 'HMAC-SHA256', user_id: '777', issued_at: Math.floor(Date.now() / 1000) }))))
        expect(r.status).toBe(200)
        expect(fake.tables[IG_TABLE][0]).toMatchObject({ token_encrypted: null, status: 'disconnected' })
    })
    it('삭제: { url, confirmation_code } + 상태 화면', async () => {
        await seed()
        const r = await deletion.POST(req('/api/sns/instagram/data-deletion', form(signed({ algorithm: 'HMAC-SHA256', user_id: '17841400000', issued_at: Math.floor(Date.now() / 1000) }))))
        expect(r.status).toBe(200)
        const d = await r.json()
        expect(d.confirmation_code).toMatch(/^[0-9a-f]{24}$/)
        expect(d.url).toBe(`https://www.curi-ai.com/api/sns/instagram/data-deletion?code=${d.confirmation_code}`)
        expect(fake.tables[IG_TABLE]).toHaveLength(0)
        const page = await deletion.GET(req(`/api/sns/instagram/data-deletion?code=${d.confirmation_code}`))
        expect(page.status).toBe(200)
        expect(await page.text()).toContain('삭제 요청을 받았어요')
        expect((await deletion.GET(req('/api/sns/instagram/data-deletion?code=zzz'))).status).toBe(404)
    })
    it('앱 설정이 없으면 503', async () => {
        vi.stubEnv('INSTAGRAM_APP_SECRET', '')
        expect((await deauthorize(req('/api/sns/instagram/deauthorize', form('x')))).status).toBe(503)
    })
})
