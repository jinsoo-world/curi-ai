// GET /api/billing/entitlement — 앱(Bearer)과 웹이 같은 답(요금제·끝나는 날·광고 없음)을 보게 하는 곳
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: { user: { id: string } | null; row: unknown; error: { code?: string; message: string } | null } = { user: null, row: null, error: null }

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
        from: (table: string) => {
            expect(table).toBe('user_plans')
            const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: state.row, error: state.error }) }
            return q
        },
    }),
}))

import { GET } from '../entitlement/route'

const U = '11111111-1111-4111-8111-111111111111'

beforeEach(() => { state.user = null; state.row = null; state.error = null })

describe('GET /api/billing/entitlement', () => {
    it('로그인 표시가 없으면 401', async () => {
        const res = await GET()
        expect(res.status).toBe(401)
    })

    it('행이 없으면 무료, 광고 있음', async () => {
        state.user = { id: U }
        const res = await GET()
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ plan: 'free', expiresAt: null, adFree: false, source: null })
    })

    it('앱에서 산 베이직이면 베이직, 광고 없음, 출처 revenuecat', async () => {
        state.user = { id: U }
        state.row = { plan: 'basic', expires_at: '2099-01-01T00:00:00Z', last_order_id: 'revenuecat:evt-1' }
        const body = await (await GET()).json()
        expect(body).toMatchObject({ plan: 'basic', expiresAt: '2099-01-01T00:00:00.000Z', adFree: true, source: 'revenuecat', limits: { limitMonth: 370, maxBots: 10 } })
    })

    it('표를 못 읽으면 503 (무료로 잘못 알려 광고를 띄우지 않게 앱이 다시 묻는다)', async () => {
        state.user = { id: U }
        state.error = { code: 'XX000', message: 'boom' }
        expect((await GET()).status).toBe(503)
    })
})
