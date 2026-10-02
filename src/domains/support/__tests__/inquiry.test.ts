// 고객센터 문의 (1002, 앱스토어 심사용 지원 주소). DB, 로그인, 메일은 가짜.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>()
const checkRateLimit = vi.fn<(...a: unknown[]) => Promise<{ allowed: boolean; remaining: number }>>()
const requireAdminAPI = vi.fn<() => Promise<{ error: string | null; status: number; user: { id: string } | null }>>()
const emailSend = vi.fn<(...a: unknown[]) => Promise<{ ok: boolean }>>(async () => ({ ok: true }))
const emailReady = vi.fn(() => true)
const adminFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: () => getUser() } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (...a: unknown[]) => adminFrom(...a) }) }))
vi.mock('@/lib/rate-limit', async (orig) => {
    const real = await orig<typeof import('@/lib/rate-limit')>()
    return { ...real, checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }
})
vi.mock('@/lib/admin-guard', () => ({ requireAdminAPI: () => requireAdminAPI() }))
vi.mock('@/domains/messaging/drivers/email', () => ({
    createEmailDriver: () => ({ ready: () => emailReady(), send: (...a: unknown[]) => emailSend(...a) }),
}))

import { validateInquiry, INQUIRY_CATEGORIES, SUPPORT_EMAIL } from '../inquiry'
import { POST } from '@/app/api/support/inquiry/route'
import { GET as adminGet, POST as adminPost } from '@/app/api/admin/os/inquiries/route'

/** 부른 표와 동작을 기록하는 가짜 DB */
type Op = { op: string; args: unknown[] }
type Q = { table: string; ops: Op[] }
function routedDb(result: (q: Q) => unknown = () => ({ data: null, error: null })) {
    const queries: Q[] = []
    adminFrom.mockImplementation((table: string) => {
        const q: Q = { table, ops: [] }
        queries.push(q)
        const chain: Record<string, unknown> = {}
        for (const op of ['select', 'insert', 'update', 'eq', 'order', 'limit', 'in']) {
            chain[op] = (...args: unknown[]) => { q.ops.push({ op, args }); return chain }
        }
        const done = async () => result(q)
        chain.single = done
        chain.maybeSingle = done
        chain.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => done().then(ok, bad)
        return chain
    })
    return queries
}
const insertsOf = (qs: Q[]) => qs.filter(q => q.table === 'support_inquiries').flatMap(q => q.ops.filter(o => o.op === 'insert').map(o => o.args[0]))

function req(body: unknown, headers: Record<string, string> = {}) {
    return new Request('http://localhost/api/support/inquiry', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    })
}
const GOOD = { category: 'account', email: 'fan@example.com', body: '로그인이 안 돼요. 도와주세요.' }

beforeEach(() => {
    getUser.mockReset(); getUser.mockResolvedValue({ data: { user: null } })
    checkRateLimit.mockReset(); checkRateLimit.mockResolvedValue({ allowed: true, remaining: 4 })
    requireAdminAPI.mockReset(); emailSend.mockClear(); emailReady.mockReset(); emailReady.mockReturnValue(true)
    adminFrom.mockReset()
})

describe('validateInquiry — 입력 확인', () => {
    it('정상 입력은 다듬어서 통과한다', () => {
        const r = validateInquiry({ ...GOOD, email: '  Fan@Example.com ', platform: 'ios', appVersion: '1.0.0' })
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.value).toEqual({ category: 'account', email: 'fan@example.com', body: GOOD.body, platform: 'ios', appVersion: '1.0.0' })
    })
    it('유형은 다섯 개 중 하나만', () => {
        expect(INQUIRY_CATEGORIES.map(c => c.value)).toEqual(['account', 'billing', 'bot', 'report', 'other'])
        expect(validateInquiry({ ...GOOD, category: 'hack' }).ok).toBe(false)
    })
    it('이메일은 꼭 있어야 하고 모양이 맞아야 한다', () => {
        expect(validateInquiry({ ...GOOD, email: '' }).ok).toBe(false)
        expect(validateInquiry({ ...GOOD, email: 'not-an-email' }).ok).toBe(false)
        expect(validateInquiry({ ...GOOD, email: 'a@b' }).ok).toBe(false)
    })
    it('내용은 10자 이상 2000자 이하', () => {
        expect(validateInquiry({ ...GOOD, body: '짧아요' }).ok).toBe(false)
        expect(validateInquiry({ ...GOOD, body: '   가나다라마바사아자   ' }).ok).toBe(false) // 다듬으면 9자
        expect(validateInquiry({ ...GOOD, body: '가'.repeat(10) }).ok).toBe(true)
        expect(validateInquiry({ ...GOOD, body: '가'.repeat(2000) }).ok).toBe(true)
        expect(validateInquiry({ ...GOOD, body: '가'.repeat(2001) }).ok).toBe(false)
    })
    it('앱 정보는 아는 값만 받고 이상하면 버린다', () => {
        const r = validateInquiry({ ...GOOD, platform: 'windows', appVersion: '<script>' })
        expect(r.ok).toBe(true)
        if (r.ok) { expect(r.value.platform).toBeNull(); expect(r.value.appVersion).toBeNull() }
        const r2 = validateInquiry({ ...GOOD, platform: 'android', appVersion: '2.10.3' })
        if (r2.ok) { expect(r2.value.platform).toBe('android'); expect(r2.value.appVersion).toBe('2.10.3') }
    })
})

describe('POST /api/support/inquiry', () => {
    it('정상 문의는 표에 한 줄 넣는다 (비로그인 = user_id 비움)', async () => {
        const qs = routedDb()
        const res = await POST(req({ ...GOOD, platform: 'ios', appVersion: '1.0.0' }))
        expect(res.status).toBe(200)
        expect((await res.json()).ok).toBe(true)
        expect(insertsOf(qs)).toEqual([{
            user_id: null, email: 'fan@example.com', category: 'account', body: GOOD.body, platform: 'ios', app_version: '1.0.0',
        }])
    })
    it('로그인했으면 사용자 id 를 서버가 붙인다 (몸통의 userId 는 무시)', async () => {
        getUser.mockResolvedValue({ data: { user: { id: 'u-123' } } })
        const qs = routedDb()
        const res = await POST(req({ ...GOOD, userId: 'someone-else', user_id: 'someone-else' }))
        expect(res.status).toBe(200)
        expect((insertsOf(qs)[0] as { user_id: string }).user_id).toBe('u-123')
        expect(checkRateLimit.mock.calls[0][1]).toBe('support:u:u-123')
    })
    it('잘못된 입력은 400, 표에 안 넣는다', async () => {
        const qs = routedDb()
        expect((await POST(req({ ...GOOD, email: 'x' }))).status).toBe(400)
        expect((await POST(req({ ...GOOD, body: '짧음' }))).status).toBe(400)
        expect((await POST(req('{깨진 몸통'))).status).toBe(400)
        expect(insertsOf(qs)).toHaveLength(0)
    })
    it('꿀단지 칸이 차 있으면 성공처럼 답하고 아무것도 안 넣는다', async () => {
        const qs = routedDb()
        const res = await POST(req({ ...GOOD, website: 'http://spam.example' }))
        expect(res.status).toBe(200)
        expect(insertsOf(qs)).toHaveLength(0)
        expect(emailSend).not.toHaveBeenCalled()
    })
    it('너무 잦으면 429, 비로그인은 IP 로 센다', async () => {
        const qs = routedDb()
        checkRateLimit.mockResolvedValue({ allowed: false, remaining: 0 })
        const res = await POST(req(GOOD))
        expect(res.status).toBe(429)
        expect(checkRateLimit.mock.calls[0][1]).toBe('support:ip:1.2.3.4')
        expect(insertsOf(qs)).toHaveLength(0)
    })
    it('넣고 나면 고객센터 메일로 한 통 보낸다 (내용은 300자까지)', async () => {
        routedDb()
        const long = '나'.repeat(500)
        await POST(req({ ...GOOD, category: 'billing', body: long }))
        expect(emailSend).toHaveBeenCalledTimes(1)
        const msg = emailSend.mock.calls[0][0] as { to: string; body: string; subject: string; channel: string }
        expect(msg.channel).toBe('email')
        expect(msg.to).toBe(SUPPORT_EMAIL)
        expect(msg.body).toContain('fan@example.com')
        expect(msg.body).toContain('결제와 환불')
        expect(msg.body).toContain('나'.repeat(300))
        expect(msg.body).not.toContain('나'.repeat(301))
    })
    it('메일이 실패해도 문의는 성공으로 답한다', async () => {
        routedDb()
        emailSend.mockRejectedValueOnce(new Error('ses down'))
        expect((await POST(req(GOOD))).status).toBe(200)
    })
    it('메일 열쇠가 없으면 보내지 않는다', async () => {
        routedDb()
        emailReady.mockReturnValue(false)
        expect((await POST(req(GOOD))).status).toBe(200)
        expect(emailSend).not.toHaveBeenCalled()
    })
    it('표에 못 넣으면 500', async () => {
        routedDb(q => (q.ops.some(o => o.op === 'insert') ? { data: null, error: { message: 'boom' } } : { data: null, error: null }))
        expect((await POST(req(GOOD))).status).toBe(500)
        expect(emailSend).not.toHaveBeenCalled()
    })
})

describe('/api/admin/os/inquiries — 관리자 창구', () => {
    const adminReq = (method: string, url: string, body?: unknown) =>
        new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })

    it('관리자가 아니면 403, 표를 안 연다', async () => {
        routedDb()
        requireAdminAPI.mockResolvedValue({ error: 'Forbidden', status: 403, user: null })
        expect((await adminGet(adminReq('GET', 'http://localhost/api/admin/os/inquiries'))).status).toBe(403)
        expect((await adminPost(adminReq('POST', 'http://localhost/api/admin/os/inquiries', { id: 'i1', status: 'answered' }))).status).toBe(403)
        expect(adminFrom).not.toHaveBeenCalled()
    })
    it('목록은 최신순, 상태로 거른다', async () => {
        requireAdminAPI.mockResolvedValue({ error: null, status: 200, user: { id: 'admin' } })
        const qs = routedDb(() => ({ data: [{ id: 'i1' }], error: null }))
        const res = await adminGet(adminReq('GET', 'http://localhost/api/admin/os/inquiries?status=open'))
        expect(res.status).toBe(200)
        expect((await res.json()).inquiries).toEqual([{ id: 'i1' }])
        const q = qs[0]
        expect(q.ops.find(o => o.op === 'order')?.args).toEqual(['created_at', { ascending: false }])
        expect(q.ops.find(o => o.op === 'eq')?.args).toEqual(['status', 'open'])
    })
    it('상태 바꾸기: 답함이면 답한 시각을 적는다, 이상한 상태는 400', async () => {
        requireAdminAPI.mockResolvedValue({ error: null, status: 200, user: { id: 'admin' } })
        const qs = routedDb(() => ({ data: { id: 'i1' }, error: null }))
        expect((await adminPost(adminReq('POST', 'http://localhost/x', { id: 'i1', status: 'bogus' }))).status).toBe(400)
        const res = await adminPost(adminReq('POST', 'http://localhost/x', { id: 'i1', status: 'answered' }))
        expect(res.status).toBe(200)
        const upd = qs.flatMap(q => q.ops.filter(o => o.op === 'update'))[0].args[0] as { status: string; answered_at: string }
        expect(upd.status).toBe('answered')
        expect(typeof upd.answered_at).toBe('string')
    })
})
