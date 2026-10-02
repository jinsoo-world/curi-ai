// POST /api/billing/revenuecat/webhook — 주소 배선 시험 (판단은 domains/os 시험이 본다)
import { describe, it, expect, vi, afterEach } from 'vitest'

const admin = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin() }))

import { POST } from '../revenuecat/webhook/route'

const req = (auth: string | null, body: unknown) => new Request('https://x/api/billing/revenuecat/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
})

afterEach(() => { vi.unstubAllEnvs(); admin.mockReset() })

describe('POST /api/billing/revenuecat/webhook', () => {
    it('열쇠가 틀리면 401 이고 DB 를 열지도 않는다', async () => {
        vi.stubEnv('REVENUECAT_WEBHOOK_AUTH', 'Bearer good')
        const res = await POST(req('Bearer bad', { event: { id: 'e', type: 'TEST' } }) as never)
        expect(res.status).toBe(401)
        expect(admin).not.toHaveBeenCalled()
    })

    it('JSON 이 아니면 400', async () => {
        vi.stubEnv('REVENUECAT_WEBHOOK_AUTH', 'Bearer good')
        admin.mockReturnValue({})
        const res = await POST(req('Bearer good', 'not json') as never)
        expect(res.status).toBe(400)
    })
})
