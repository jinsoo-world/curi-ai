// /api/os/mcp — 손님 401, 응답에 인증 값 없음, 요금제 한도, 연결 시험
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { randomBytes } from 'crypto'
import { fakeDb } from '@/domains/mcp/__tests__/fake-db'

const SECRET = 'sk-live-SUPERSECRET-555555'
const state: { user: { id: string } | null; fake: ReturnType<typeof fakeDb>; plan: string } = { user: null, fake: fakeDb(), plan: 'free' }

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => state.fake.db }))
vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: async () => ({ allowed: true }),
    rateLimitKey: () => 'k',
    rateLimitMessage: () => '잠시 뒤',
}))
vi.mock('@/domains/os/usage-db', () => ({ readPlanId: async () => state.plan }))
const initialize = vi.fn()
const listTools = vi.fn()
vi.mock('@/domains/mcp/client', async (orig) => {
    const real = await orig<typeof import('@/domains/mcp/client')>()
    return {
        ...real,
        McpSession: class { constructor(public url: string, public auth: unknown) {} initialize = initialize; listTools = listTools },
    }
})

import { GET, POST } from '@/app/api/os/mcp/route'
import { PATCH, DELETE } from '@/app/api/os/mcp/[id]/route'
import { POST as TEST } from '@/app/api/os/mcp/[id]/test/route'
import { McpError } from '@/domains/mcp/client'

const req = (method: string, body?: unknown) => new Request('https://x/api/os/mcp', { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { authorization: 'Bearer app-token' } })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

beforeAll(() => { process.env.CONNECTOR_SECRET_KEY = randomBytes(32).toString('base64') })
beforeEach(() => { state.user = { id: 'u1' }; state.fake = fakeDb(); state.plan = 'free'; initialize.mockReset(); listTools.mockReset() })

describe('/api/os/mcp', () => {
    it('손님은 모든 창구에서 401', async () => {
        state.user = null
        expect((await GET()).status).toBe(401)
        expect((await POST(req('POST', {}))).status).toBe(401)
        expect((await PATCH(req('PATCH', {}), ctx('x'))).status).toBe(401)
        expect((await DELETE(req('DELETE'), ctx('x'))).status).toBe(401)
        expect((await TEST(req('POST'), ctx('x'))).status).toBe(401)
    })

    it('추가·목록 응답에 인증 값이 없고, 무료는 1개까지', async () => {
        const res = await POST(req('POST', { name: '내 서버', url: 'https://mcp.example.com/mcp', authValue: SECRET }))
        expect(res.status).toBe(201)
        const text = await res.text()
        expect(text).not.toContain('SUPERSECRET')
        expect(JSON.parse(text).server).toMatchObject({ name: '내 서버', hasAuth: true, authHint: '••••5555' })

        const list = await (await GET()).text()
        expect(list).not.toContain('SUPERSECRET')
        expect(JSON.parse(list)).toMatchObject({ enabled: true, plan: 'free', limit: 1 })

        const second = await POST(req('POST', { name: '둘', url: 'https://b.example.com/mcp' }))
        expect(second.status).toBe(403)
        expect((await second.json()).limit).toBe(1)
    })

    it('내부망 주소는 400', async () => {
        const res = await POST(req('POST', { name: 'x', url: 'https://169.254.169.254/' }))
        expect(res.status).toBe(400)
    })

    it('남의 서버는 404', async () => {
        const created = await (await POST(req('POST', { name: 'a', url: 'https://a.example.com/mcp' }))).json()
        state.user = { id: 'intruder' }
        expect((await PATCH(req('PATCH', { name: 'b' }), ctx(created.server.id))).status).toBe(404)
        expect((await DELETE(req('DELETE'), ctx(created.server.id))).status).toBe(404)
        expect((await TEST(req('POST'), ctx(created.server.id))).status).toBe(404)
    })

    it('연결 시험: 도구 이름·설명만 돌려주고 상태를 남긴다. 실패해도 인증 값은 안 나간다', async () => {
        const created = await (await POST(req('POST', { name: 'a', url: 'https://a.example.com/mcp', authValue: SECRET }))).json()
        initialize.mockResolvedValue({ serverName: '시험' })
        listTools.mockResolvedValue([{ name: 'search', description: '찾기', inputSchema: { type: 'object' } }])
        const ok = await (await TEST(req('POST'), ctx(created.server.id))).json()
        expect(ok).toEqual({ ok: true, serverName: '시험', tools: [{ name: 'search', description: '찾기' }] })
        expect(state.fake.rows[0]).toMatchObject({ status: 'ok', tool_count: 1 })

        initialize.mockRejectedValue(new McpError('서버가 인증을 거절했어요(인증 값을 확인해 주세요)'))
        const bad = await (await TEST(req('POST'), ctx(created.server.id))).text()
        expect(bad).not.toContain('SUPERSECRET')
        expect(JSON.parse(bad)).toMatchObject({ ok: false })
        expect(state.fake.rows[0]).toMatchObject({ status: 'error' })
        expect(String(state.fake.rows[0].last_error)).not.toContain('SUPERSECRET')
    })

    it('PATCH 로 끄기·봇 고르기', async () => {
        const created = await (await POST(req('POST', { name: 'a', url: 'https://a.example.com/mcp' }))).json()
        const res = await PATCH(req('PATCH', { enabled: false, botIds: ['11111111-1111-4111-8111-111111111111'] }), ctx(created.server.id))
        expect((await res.json()).server).toMatchObject({ enabled: false, botIds: ['11111111-1111-4111-8111-111111111111'] })
    })
})
