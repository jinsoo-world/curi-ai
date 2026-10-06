// 앱 연결 창구 — app-start / callback(앱·웹) / app-finish / notion app-token
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'

type Pending = { user_id: string; proof_hash: string; kind: string; secret_encrypted: string; meta: Record<string, unknown>; expires_at: string }
const st: {
    user: { id: string } | null
    nonces: Set<string>
    pending: Map<string, Pending>
    saved: { user_id: string; kind: string; secret_encrypted: string }[]
    nonceTable: boolean
    rlAllowed: boolean
    insertError: string | null
} = { user: null, nonces: new Set(), pending: new Map(), saved: [], nonceTable: true, rlAllowed: true, insertError: null }

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: st.user } }) } }),
}))
vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: async () => ({ allowed: st.rlAllowed, remaining: 0 }),
    rateLimitMessage: () => '잠시 뒤',
}))
vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
        from: (t: string) => {
            if (t === 'connector_app_nonces') {
                return {
                    insert: async (r: { nonce: string }) => {
                        if (!st.nonceTable) return { error: { code: '42P01', message: 'no table' } }
                        if (st.nonces.has(r.nonce)) return { error: { code: '23505', message: 'dup' } }
                        st.nonces.add(r.nonce); return { error: null }
                    },
                }
            }
            if (t === 'connector_app_pending') {
                return {
                    insert: async (r: Pending & { handoff_hash: string }) => { st.pending.set(r.handoff_hash, r); return { error: null } },
                    delete: () => {
                        const q = { hash: '', after: '' }
                        const chain: Record<string, unknown> = {
                            eq: (_c: string, v: string) => { q.hash = v; return chain },
                            gt: (_c: string, v: string) => { q.after = v; return chain },
                            select: () => chain,
                            maybeSingle: async () => {
                                const row = st.pending.get(q.hash)
                                if (!row || row.expires_at <= q.after) return { data: null, error: null }
                                st.pending.delete(q.hash)
                                return { data: row, error: null }
                            },
                        }
                        return chain
                    },
                }
            }
            // connectors: replaceConnector / createConnector 가 쓰는 모양
            const sel: Record<string, unknown> = {}
            Object.assign(sel, { eq: () => sel, order: () => sel, then: (r: (v: unknown) => unknown) => r({ data: [], count: 0, error: null }) })
            return {
                select: () => sel,
                delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
                insert: (row: { user_id: string; kind: string; secret_encrypted: string }) => {
                    if (st.insertError) return { select: () => ({ single: async () => ({ data: null, error: { message: st.insertError } }) }) }
                    st.saved.push(row)
                    const data = { id: 'c1', kind: row.kind, label: 'x', secret_encrypted: row.secret_encrypted, meta: {}, status: 'connected', created_at: new Date().toISOString(), last_used_at: null }
                    return { select: () => ({ single: async () => ({ data, error: null }) }) }
                },
            }
        },
    }),
}))
const ping = vi.fn()
vi.mock('@/domains/connectors/notion', async (orig) => ({ ...(await orig<typeof import('@/domains/connectors/notion')>()), notionPing: (...a: unknown[]) => ping(...a) }))

import { POST as appStart } from '../[provider]/app-start/route'
import { GET as callback } from '../[provider]/callback/route'
import { GET as webStart } from '../[provider]/start/route'
import { POST as appFinish } from '../app-finish/route'
import { POST as appToken } from '../notion/app-token/route'
import { appProofOf, newAppState, verifyAppState } from '@/domains/connectors/app-state'
import { decryptSecret, readConnectorKey } from '@/domains/connectors'

const ctx = (provider: string) => ({ params: Promise.resolve({ provider }) })
const post = (url: string, body?: unknown) => new NextRequest(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers: { authorization: 'Bearer app-token' } })
const origFetch = global.fetch
const SECRET = 'app-secret-AAAA'
const PROOF = appProofOf(SECRET)
const TOK = 'ntn_abcdefghijklmnopqrstuvwxyz0123456789'

beforeAll(() => {
    process.env.CONNECTOR_SECRET_KEY = randomBytes(32).toString('base64')
    process.env.NEXT_PUBLIC_APP_URL = 'https://curi.test'
    process.env.NOTION_CLIENT_ID = 'nid'; process.env.NOTION_CLIENT_SECRET = 'nsec'
})
beforeEach(() => {
    st.user = { id: 'u1' }; st.nonces = new Set(); st.pending = new Map(); st.saved = []; st.nonceTable = true
    st.rlAllowed = true; st.insertError = null; ping.mockReset()
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ access_token: 'tok-SECRET' }), { status: 200 })) as never
})
afterEach(() => { global.fetch = origFetch })

const handoffOf = (res: Response) => new URL(res.headers.get('location')!.replace('curiai://', 'https://')).searchParams.get('handoff')!
const go = (state: string, extra = '', provider = 'notion') =>
    callback(new NextRequest(`https://curi.test/api/connect/${provider}/callback?code=abc&state=${encodeURIComponent(state)}${extra}`), ctx(provider))
const finish = (handoff: string, appSecret = SECRET) => appFinish(post('https://curi.test/api/connect/app-finish', { handoff, appSecret }))

describe('app-start', () => {
    it('손님 401', async () => {
        st.user = null
        expect((await appStart(post('https://curi.test/x', { appProof: PROOF }), ctx('notion'))).status).toBe(401)
    })
    it('appProof 가 없거나 모양이 틀리면 400', async () => {
        expect((await appStart(post('https://curi.test/x'), ctx('notion'))).status).toBe(400)
        expect((await appStart(post('https://curi.test/x', { appProof: 'abc' }), ctx('notion'))).status).toBe(400)
    })
    it('없는·준비 안 된 공급자는 400', async () => {
        expect((await appStart(post('https://curi.test/x', { appProof: PROOF }), ctx('nope'))).status).toBe(400)
        expect((await appStart(post('https://curi.test/x', { appProof: PROOF }), ctx('instagram'))).status).toBe(400)
    })
    it('준비된 공급자는 사용자·proof 가 서명된 state 가 든 인증 주소를 준다', async () => {
        const res = await appStart(post('https://curi.test/x', { appProof: PROOF }), ctx('notion'))
        expect(res.status).toBe(200)
        const u = new URL((await res.json()).url)
        expect(u.origin + u.pathname).toBe('https://api.notion.com/v1/oauth/authorize')
        expect(u.searchParams.get('redirect_uri')).toBe('https://curi.test/api/connect/notion/callback')
        expect(verifyAppState(u.searchParams.get('state'), readConnectorKey()!)).toMatchObject({ u: 'u1', p: 'notion', pr: PROOF, src: 'app' })
    })
})

describe('callback — 앱', () => {
    it('성공해도 바로 저장하지 않고 handoff 만 딥링크로 보낸다(웹 로그인은 보지 않는다)', async () => {
        st.user = null
        const res = await go(newAppState('u7', 'notion', readConnectorKey()!, PROOF).state)
        const loc = res.headers.get('location')!
        expect(loc).toMatch(/^curiai:\/\/connect\?handoff=[A-Za-z0-9_-]+&provider=notion$/)
        expect(loc).not.toContain('SECRET')
        expect(st.saved).toHaveLength(0)
        expect(st.pending.size).toBe(1)
        expect([...st.pending.values()][0].secret_encrypted).not.toContain('SECRET')
        expect([...st.pending.keys()][0]).not.toContain(handoffOf(res))   // 표에는 handoff 원문이 없다
    })
    it('재사용은 두 번째가 bad_state', async () => {
        const { state } = newAppState('u1', 'notion', readConnectorKey()!, PROOF)
        expect((await go(state)).headers.get('location')).toContain('handoff=')
        expect((await go(state)).headers.get('location')).toBe('curiai://connect?error=bad_state&provider=notion')
        expect(st.pending.size).toBe(1)
    })
    it('위조·만료·다른 공급자 state 는 bad_state, 보관 없음', async () => {
        const key = readConnectorKey()!
        const good = newAppState('u1', 'notion', key, PROOF).state
        const forged = good.slice(0, -3) + 'AAA'
        const old = newAppState('u1', 'notion', key, PROOF, Math.floor(Date.now() / 1000) - 700).state
        const other = newAppState('u1', 'google_drive', key, PROOF).state
        for (const s of [forged, old, other]) {
            expect((await go(s)).headers.get('location')).toBe('curiai://connect?error=bad_state&provider=notion')
        }
        expect(st.pending.size).toBe(0)
    })
    it('허용 안 함은 denied, 토큰 거절은 token, 표 없음은 table', async () => {
        const key = readConnectorKey()!
        expect((await go(newAppState('u1', 'notion', key, PROOF).state, '&error=access_denied')).headers.get('location'))
            .toBe('curiai://connect?error=denied&provider=notion')
        global.fetch = vi.fn(async () => new Response('{}', { status: 400 })) as never
        expect((await go(newAppState('u1', 'notion', key, PROOF).state)).headers.get('location')).toBe('curiai://connect?error=token&provider=notion')
        st.nonceTable = false
        expect((await go(newAppState('u1', 'notion', key, PROOF).state)).headers.get('location')).toBe('curiai://connect?error=table&provider=notion')
    })
})

describe('app-finish', () => {
    const handoffFor = async (userId: string) => handoffOf(await go(newAppState(userId, 'notion', readConnectorKey()!, PROOF).state))

    it('본인 + 맞는 비밀값이면 저장하고 토큰 JSON 이 잠긴 채 옮겨진다', async () => {
        const h = await handoffFor('u1')
        const res = await finish(h)
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ connected: 'notion' })
        expect(st.saved.map(r => r.user_id)).toEqual(['u1'])
        expect(decryptSecret(st.saved[0].secret_encrypted, readConnectorKey()!)).toContain('tok-SECRET')
        expect(st.pending.size).toBe(0)
    })
    it('공격자 state 를 피해자가 마무리하면 거절(계정 바꿔치기 방지), 저장 없음', async () => {
        const h = await handoffFor('attacker')      // 공격자가 자기 app-start 로 만든 state, 피해자가 동의
        st.user = { id: 'victim' }
        const res = await finish(h, 'victim-own-secret')
        expect(res.status).toBe(400)
        expect(st.saved).toHaveLength(0)
        expect(st.pending.size).toBe(0)             // 꺼낸 행은 지워져 다시 못 쓴다
    })
    it('사용자가 같아도 비밀값 원문이 틀리면 거절', async () => {
        const h = await handoffFor('u1')
        expect((await finish(h, 'wrong')).status).toBe(400)
        expect(st.saved).toHaveLength(0)
    })
    it('다른 사용자 Bearer 로는 거절, 그 뒤 본인도 못 쓴다(1회용)', async () => {
        const h = await handoffFor('u1')
        st.user = { id: 'u2' }
        expect((await finish(h)).status).toBe(400)
        st.user = { id: 'u1' }
        expect((await finish(h)).status).toBe(400)
    })
    it('두 번째 호출은 거절, 만료된 것도 거절, 없는 handoff 도 거절', async () => {
        const h = await handoffFor('u1')
        expect((await finish(h)).status).toBe(200)
        expect((await finish(h)).status).toBe(400)
        const h2 = await handoffFor('u1')
        for (const row of st.pending.values()) row.expires_at = new Date(Date.now() - 1000).toISOString()
        expect((await finish(h2)).status).toBe(400)
        expect((await finish('nope')).status).toBe(400)
        expect((await appFinish(post('https://curi.test/x', {}))).status).toBe(400)
    })
    it('손님 401, 횟수 초과 429', async () => {
        st.user = null
        expect((await finish('x')).status).toBe(401)
        st.user = { id: 'u1' }; st.rlAllowed = false
        expect((await finish('x')).status).toBe(429)
    })
})

describe('callback·start — 웹 회귀', () => {
    it('웹 start 는 쿠키를 심고 로그인 주소로 보낸다', async () => {
        const res = await webStart(new NextRequest('https://curi.test/api/connect/notion/start'), ctx('notion'))
        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toContain('api.notion.com')
        expect(res.headers.get('set-cookie')).toContain('cx_oauth_notion=')
    })
    it('웹 callback: 쿠키 state 가 맞으면 바로 저장하고 /os/connect 로', async () => {
        const start = await webStart(new NextRequest('https://curi.test/api/connect/notion/start'), ctx('notion'))
        const state = new URL(start.headers.get('location')!).searchParams.get('state')!
        const cookie = /cx_oauth_notion=([^;]+)/.exec(start.headers.get('set-cookie')!)![1]
        const res = await callback(new NextRequest(`https://curi.test/api/connect/notion/callback?code=abc&state=${state}`, { headers: { cookie: `cx_oauth_notion=${cookie}` } }), ctx('notion'))
        expect(res.headers.get('location')).toBe('https://curi.test/os/connect?connected=notion')
        expect(st.saved.map(r => r.user_id)).toEqual(['u1'])
    })
    it('웹 callback: state 가 틀리면 bad_state, 로그인 없으면 /login', async () => {
        const bad = await callback(new NextRequest('https://curi.test/api/connect/notion/callback?code=abc&state=zzz'), ctx('notion'))
        expect(bad.headers.get('location')).toBe('https://curi.test/os/connect?error=bad_state&provider=notion')
        st.user = null
        const nl = await callback(new NextRequest('https://curi.test/api/connect/notion/callback?code=abc&state=zzz'), ctx('notion'))
        expect(nl.headers.get('location')).toContain('/login')
    })
    it('웹 쿠키에 앱 state 를 넣거나 app. 을 붙여도 통과하지 못한다', async () => {
        const key = readConnectorKey()!
        const appState = newAppState('u1', 'notion', key, PROOF).state
        // 앱 state 를 웹 쿠키·state 로 위장(앞 표시 떼기)
        const body = appState.slice('app.'.length)
        const res = await callback(new NextRequest(`https://curi.test/api/connect/notion/callback?code=abc&state=${encodeURIComponent(body)}`, { headers: { cookie: `cx_oauth_notion=${encodeURIComponent(body)}` } }), ctx('notion'))
        expect(res.headers.get('location')).toBe('https://curi.test/os/connect?error=bad_state&provider=notion')
        expect(st.saved).toHaveLength(0)
    })
})

describe('notion app-token', () => {
    it('손님 401, 분당 5회 초과 429', async () => {
        st.user = null
        expect((await appToken(post('https://curi.test/x', { token: TOK }))).status).toBe(401)
        st.user = { id: 'u1' }; st.rlAllowed = false
        expect((await appToken(post('https://curi.test/x', { token: TOK }))).status).toBe(429)
    })
    it('빈 값·모양 틀림 400, 노션이 거절하면 400', async () => {
        expect((await appToken(post('https://curi.test/x', {}))).status).toBe(400)
        expect((await appToken(post('https://curi.test/x', { token: 'hello' }))).status).toBe(400)
        ping.mockRejectedValueOnce(new Error('401'))
        expect((await appToken(post('https://curi.test/x', { token: TOK }))).status).toBe(400)
        expect(st.saved).toHaveLength(0)
    })
    it('정상이면 잠가서 저장하고 응답에 토큰이 없다', async () => {
        ping.mockResolvedValueOnce(undefined)
        const res = await appToken(post('https://curi.test/x', { token: TOK }))
        expect(res.status).toBe(200)
        expect(await res.text()).not.toContain(TOK)
        expect(st.saved[0]).toMatchObject({ user_id: 'u1', kind: 'notion' })
        expect(st.saved[0].secret_encrypted).not.toContain(TOK)
    })
    it('저장 실패 시 DB 오류 원문을 내보내지 않는다', async () => {
        ping.mockResolvedValueOnce(undefined)
        st.insertError = 'duplicate key value violates unique constraint "connectors_pkey"'
        const res = await appToken(post('https://curi.test/x', { token: TOK }))
        expect(res.status).toBe(500)
        expect(await res.text()).not.toContain('constraint')
    })
})
