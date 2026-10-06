// 앱 연결 창구 — app-start / callback(앱·웹) / notion app-token
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'

const st: {
    user: { id: string } | null
    nonces: Set<string>
    saved: { user_id: string; kind: string; secret_encrypted: string }[]
    nonceTable: boolean
} = { user: null, nonces: new Set(), saved: [], nonceTable: true }

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: st.user } }) } }),
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
            // connectors: replaceConnector / createConnector 가 쓰는 모양
            const sel: Record<string, unknown> = {}
            Object.assign(sel, {
                eq: () => sel, order: () => sel,
                then: (r: (v: unknown) => unknown) => r({ data: [], count: 0, error: null }),
            })
            return {
                select: () => sel,
                delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
                insert: (row: { user_id: string; kind: string; secret_encrypted: string }) => {
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
import { POST as appToken } from '../notion/app-token/route'
import { newAppState, verifyAppState } from '@/domains/connectors/app-state'
import { readConnectorKey } from '@/domains/connectors'

const ctx = (provider: string) => ({ params: Promise.resolve({ provider }) })
const post = (url: string, body?: unknown) => new NextRequest(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), headers: { authorization: 'Bearer app-token' } })
const origFetch = global.fetch

beforeAll(() => {
    process.env.CONNECTOR_SECRET_KEY = randomBytes(32).toString('base64')
    process.env.NEXT_PUBLIC_APP_URL = 'https://curi.test'
    process.env.NOTION_CLIENT_ID = 'nid'; process.env.NOTION_CLIENT_SECRET = 'nsec'
    process.env.GOOGLE_CLIENT_ID = 'gid'; process.env.GOOGLE_CLIENT_SECRET = 'gsec'
})
beforeEach(() => {
    st.user = { id: 'u1' }; st.nonces = new Set(); st.saved = []; st.nonceTable = true; ping.mockReset()
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ access_token: 'tok-SECRET' }), { status: 200 })) as never
})
afterEach(() => { global.fetch = origFetch })

describe('app-start', () => {
    it('손님 401', async () => {
        st.user = null
        expect((await appStart(post('https://curi.test/api/connect/notion/app-start'), ctx('notion'))).status).toBe(401)
    })
    it('없는·준비 안 된 공급자는 400', async () => {
        expect((await appStart(post('https://curi.test/x'), ctx('nope'))).status).toBe(400)
        expect((await appStart(post('https://curi.test/x'), ctx('instagram'))).status).toBe(400)   // 곧 열려요
    })
    it('준비된 공급자는 서명된 state 가 든 인증 주소를 준다', async () => {
        const res = await appStart(post('https://curi.test/x'), ctx('notion'))
        expect(res.status).toBe(200)
        const { url } = await res.json()
        const u = new URL(url)
        expect(u.origin + u.pathname).toBe('https://api.notion.com/v1/oauth/authorize')
        expect(u.searchParams.get('redirect_uri')).toBe('https://curi.test/api/connect/notion/callback')
        const s = verifyAppState(u.searchParams.get('state'), readConnectorKey()!)
        expect(s).toMatchObject({ u: 'u1', p: 'notion', src: 'app' })
    })
})

describe('callback — 앱', () => {
    const go = (state: string, extra = '', provider = 'notion') =>
        callback(new NextRequest(`https://curi.test/api/connect/${provider}/callback?code=abc&state=${encodeURIComponent(state)}${extra}`), ctx(provider))

    it('성공하면 그 사용자 이름으로 저장하고 앱 딥링크로, 쿠키 로그인은 보지 않는다', async () => {
        st.user = null   // 앱 안 브라우저엔 웹 로그인이 없다
        const { state } = newAppState('u7', 'notion', readConnectorKey()!)
        const res = await go(state)
        expect(res.headers.get('location')).toBe('curiai://connect?connected=notion')
        expect(st.saved).toHaveLength(1)
        expect(st.saved[0].user_id).toBe('u7')
        expect(st.saved[0].secret_encrypted).not.toContain('SECRET')
    })
    it('웹 로그인 사용자가 달라도 state 의 사용자로만 저장(바꿔치기 불가)', async () => {
        st.user = { id: 'attacker' }
        const { state } = newAppState('victim', 'notion', readConnectorKey()!)
        await go(state)
        expect(st.saved.map(r => r.user_id)).toEqual(['victim'])
    })
    it('재사용은 두 번째가 bad_state', async () => {
        const { state } = newAppState('u1', 'notion', readConnectorKey()!)
        expect((await go(state)).headers.get('location')).toContain('connected=notion')
        expect((await go(state)).headers.get('location')).toBe('curiai://connect?error=bad_state&provider=notion')
        expect(st.saved).toHaveLength(1)
    })
    it('위조·만료·다른 공급자 state 는 bad_state, 저장 없음', async () => {
        const key = readConnectorKey()!
        const good = newAppState('u1', 'notion', key).state
        const forged = good.slice(0, -3) + 'AAA'
        const old = newAppState('u1', 'notion', key, Math.floor(Date.now() / 1000) - 700).state
        const other = newAppState('u1', 'google_drive', key).state
        for (const s of [forged, old, other]) {
            expect((await go(s)).headers.get('location')).toBe('curiai://connect?error=bad_state&provider=notion')
        }
        expect(st.saved).toHaveLength(0)
    })
    it('허용 안 함은 denied, 토큰 거절은 token, 표 없음은 table', async () => {
        const key = readConnectorKey()!
        expect((await go(newAppState('u1', 'notion', key).state, '&error=access_denied')).headers.get('location'))
            .toBe('curiai://connect?error=denied&provider=notion')
        global.fetch = vi.fn(async () => new Response('{}', { status: 400 })) as never
        expect((await go(newAppState('u1', 'notion', key).state)).headers.get('location')).toBe('curiai://connect?error=token&provider=notion')
        st.nonceTable = false
        expect((await go(newAppState('u1', 'notion', key).state)).headers.get('location')).toBe('curiai://connect?error=table&provider=notion')
    })
})

describe('callback·start — 웹 회귀', () => {
    it('웹 start 는 쿠키를 심고 로그인 주소로 보낸다', async () => {
        const res = await webStart(new NextRequest('https://curi.test/api/connect/notion/start'), ctx('notion'))
        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toContain('api.notion.com')
        expect(res.headers.get('set-cookie')).toContain('cx_oauth_notion=')
    })
    it('웹 callback: 쿠키 state 가 맞으면 저장하고 /os/connect 로', async () => {
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
})

describe('notion app-token', () => {
    it('손님 401', async () => {
        st.user = null
        expect((await appToken(post('https://curi.test/x', { token: 'ntn_abcdefghijklmnopqrstuvwxyz0123456789' }))).status).toBe(401)
    })
    it('빈 값·모양 틀림 400, 노션이 거절하면 400', async () => {
        expect((await appToken(post('https://curi.test/x', {}))).status).toBe(400)
        expect((await appToken(post('https://curi.test/x', { token: 'hello' }))).status).toBe(400)
        ping.mockRejectedValueOnce(new Error('401'))
        expect((await appToken(post('https://curi.test/x', { token: 'ntn_abcdefghijklmnopqrstuvwxyz0123456789' }))).status).toBe(400)
        expect(st.saved).toHaveLength(0)
    })
    it('정상이면 잠가서 저장하고 응답에 토큰이 없다', async () => {
        ping.mockResolvedValueOnce(undefined)
        const t = 'ntn_abcdefghijklmnopqrstuvwxyz0123456789'
        const res = await appToken(post('https://curi.test/x', { token: t }))
        expect(res.status).toBe(200)
        expect(await res.text()).not.toContain(t)
        expect(st.saved[0]).toMatchObject({ user_id: 'u1', kind: 'notion' })
        expect(st.saved[0].secret_encrypted).not.toContain(t)
    })
})
