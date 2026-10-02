// /api/os/messages/send — 봇이 남에게 보내는 길. 메일은 잠금을 지나야 관문으로 가고, 문자는 기본으로 꺼져 있다.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const dispatchWith = vi.fn()
const getApprovedRequest = vi.fn()
const guard = { listSentToday: vi.fn(), reserve: vi.fn(), release: vi.fn(), isSuppressed: vi.fn() }

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: async () => ({ allowed: true }),
    rateLimitKey: (a: string, b: string) => `${a}:${b}`,
    rateLimitMessage: (s: string) => s,
}))
vi.mock('@/domains/messaging', () => ({
    dispatchWith: (...a: unknown[]) => dispatchWith(...a),
    createSupabaseStore: () => ({ getApprovedRequest: (...a: unknown[]) => getApprovedRequest(...a) }),
}))
vi.mock('@/domains/messaging/outbound-guard', async (orig) => {
    const real = await orig<typeof import('@/domains/messaging/outbound-guard')>()
    return { ...real, createOutboundGuardStore: () => guard }
})

import { POST } from '@/app/api/os/messages/send/route'
import { hashRecipient } from '@/domains/messaging/outbound-guard'

const post = (body: unknown) => POST(new Request('https://x/api/os/messages/send', { method: 'POST', body: JSON.stringify(body) }))
const mail = (extra: Record<string, unknown> = {}) => ({ permissionRequestId: 'card-1', channel: 'email', to: 'fan@example.com', subject: '자료', body: '보내드려요', ...extra })

const ENV_KEYS = ['OS_OUTBOUND_MAIL_ENABLED', 'OS_OUTBOUND_SMS_ENABLED'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => {
    for (const k of ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k] }
    dispatchWith.mockReset().mockResolvedValue({ status: 'sent', message: '보냈어요.' })
    getApprovedRequest.mockReset().mockImplementation(async (id: string, userId: string) => id === 'card-1' ? { id, userId } : null)
    guard.listSentToday.mockReset().mockResolvedValue([])
    guard.reserve.mockReset().mockResolvedValue('res-1')
    guard.release.mockReset().mockResolvedValue(undefined)
    guard.isSuppressed.mockReset().mockResolvedValue(false)
})
afterEach(() => { for (const k of ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })

describe('/api/os/messages/send', () => {
    it('평범한 1:1 메일은 관문으로 넘어가고, 받는 주소 지문이 같이 간다', async () => {
        const res = await post(mail())
        expect(res.status).toBe(200)
        expect(dispatchWith).toHaveBeenCalledTimes(1)
        const arg = dispatchWith.mock.calls[0][1] as { message: { toHash?: string; to?: string } }
        expect(arg.message.to).toBe('fan@example.com')
        expect(arg.message.toHash).toBe(hashRecipient('fan@example.com'))
        expect(getApprovedRequest).toHaveBeenCalledWith('card-1', 'u1')
        expect(guard.release).toHaveBeenCalledWith('res-1')   // 보내고 나면 보내는 중 줄을 지운다(최종 기록은 관문이 따로 적는다)
    })

    it('승인 카드가 없으면(없는 카드·남의 카드) 잠금·반송 명단을 보기 전에 403', async () => {
        const res = await post(mail({ permissionRequestId: 'someone-elses-card' }))
        expect(res.status).toBe(403)
        expect((await res.json()).message).toBe('허용된 승인 카드가 없어 보내지 않았어요.')
        expect(guard.isSuppressed).not.toHaveBeenCalled()
        expect(guard.reserve).not.toHaveBeenCalled()
        expect(guard.listSentToday).not.toHaveBeenCalled()
        expect(dispatchWith).not.toHaveBeenCalled()
    })

    it('카드 확인이 실패해도 403 (닫힌 쪽)', async () => {
        getApprovedRequest.mockRejectedValue(new Error('db down'))
        const res = await post(mail())
        expect(res.status).toBe(403)
        expect(guard.isSuppressed).not.toHaveBeenCalled()
    })

    it('관문이 던져도 보내는 중 줄은 지운다', async () => {
        dispatchWith.mockRejectedValue(new Error('boom'))
        await expect(post(mail())).rejects.toThrow('boom')
        expect(guard.release).toHaveBeenCalledWith('res-1')
    })

    it("OS_OUTBOUND_MAIL_ENABLED='0' 이면 503, 관문을 부르지 않는다", async () => {
        process.env.OS_OUTBOUND_MAIL_ENABLED = '0'
        const res = await post(mail())
        expect(res.status).toBe(503)
        expect((await res.json()).error).toContain('잠시 멈춰')
        expect(dispatchWith).not.toHaveBeenCalled()
    })

    it('여러 명에게 보내려 하면 400', async () => {
        const res = await post(mail({ to: 'a@x.com, b@x.com' }))
        expect(res.status).toBe(400)
        expect(dispatchWith).not.toHaveBeenCalled()
    })

    it('하루 20통을 넘기면 429', async () => {
        guard.listSentToday.mockResolvedValue(Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, toHash: hashRecipient('fan@example.com') })))
        const res = await post(mail())
        expect(res.status).toBe(429)
        expect(dispatchWith).not.toHaveBeenCalled()
    })

    it('반송·거부 명단에 있는 주소면 403', async () => {
        guard.isSuppressed.mockResolvedValue(true)
        const res = await post(mail())
        expect(res.status).toBe(403)
        expect(dispatchWith).not.toHaveBeenCalled()
    })

    it('문자는 기본으로 꺼져 있다(SMS_ENABLED 를 켜도 이 길은 따로 켜야 한다)', async () => {
        process.env.SMS_ENABLED = 'true'
        const res = await post({ permissionRequestId: 'card-1', channel: 'sms', to: '01012345678', body: '안녕하세요' })
        delete process.env.SMS_ENABLED
        expect(res.status).toBe(403)
        expect((await res.json()).error).toContain('문자')
        expect(dispatchWith).not.toHaveBeenCalled()
    })

    it("OS_OUTBOUND_SMS_ENABLED='1' 일 때만 문자가 관문으로 간다", async () => {
        process.env.OS_OUTBOUND_SMS_ENABLED = '1'
        const res = await post({ permissionRequestId: 'card-1', channel: 'sms', to: '01012345678', body: '안녕하세요' })
        expect(res.status).toBe(200)
        expect(dispatchWith).toHaveBeenCalledTimes(1)
    })

    it('푸시는 잠금과 상관없이 그대로 간다', async () => {
        process.env.OS_OUTBOUND_MAIL_ENABLED = '0'
        const res = await post({ permissionRequestId: 'card-1', channel: 'push', body: '안녕하세요' })
        expect(res.status).toBe(200)
        expect(guard.listSentToday).not.toHaveBeenCalled()
    })
})
