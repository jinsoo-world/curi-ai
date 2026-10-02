// GET /api/billing/entitlement — 앱(Bearer)과 웹이 같은 답(요금제·끝나는 날·광고 없음)을 보게 하는 곳
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state: {
    user: { id: string } | null
    rows: unknown[]
    error: { code?: string; message: string } | null
} = { user: null, rows: [], error: null }
const sync = vi.fn(async () => false)

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
        from: (table: string) => {
            expect(table).toBe('user_plans')
            const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: state.rows.length > 1 ? state.rows.shift() : state.rows[0] ?? null, error: state.error }) }
            return q
        },
    }),
}))
vi.mock('@/domains/os/revenuecat-sync', () => ({ maybeSyncRevenueCat: (...a: unknown[]) => (sync as (...x: unknown[]) => Promise<boolean>)(...a) }))

import { GET } from '../entitlement/route'

const U = '11111111-1111-4111-8111-111111111111'

beforeEach(() => { state.user = null; state.rows = []; state.error = null; sync.mockReset(); sync.mockResolvedValue(false) })

describe('GET /api/billing/entitlement', () => {
    it('로그인 표시가 없으면 401 (저장 금지 머리글 포함)', async () => {
        const res = await GET()
        expect(res.status).toBe(401)
        expect(res.headers.get('cache-control')).toBe('no-store')
    })

    it('행이 없으면 무료, 광고 있음', async () => {
        state.user = { id: U }
        const res = await GET()
        expect(res.status).toBe(200)
        expect(res.headers.get('cache-control')).toBe('no-store')
        expect(await res.json()).toMatchObject({ plan: 'free', expiresAt: null, adFree: false, source: null })
    })

    it('앱에서 산 베이직이면 베이직, 광고 없음, 출처 revenuecat. 동기화는 부르지 않는다', async () => {
        state.user = { id: U }
        state.rows = [{ plan: 'basic', expires_at: '2099-01-01T00:00:00Z', last_order_id: 'revenuecat:evt-1' }]
        const body = await (await GET()).json()
        expect(body).toMatchObject({ plan: 'basic', expiresAt: '2099-01-01T00:00:00.000Z', adFree: true, source: 'revenuecat', limits: { limitMonth: 370, maxBots: 10 } })
        expect(sync).not.toHaveBeenCalled()
    })

    it('무료면 레비뉴캣에 한 번 물어(동기화) 바뀌었으면 다시 읽는다', async () => {
        state.user = { id: U }
        state.rows = [null, { plan: 'pro', expires_at: '2099-01-01T00:00:00Z', last_order_id: 'revenuecat:sync-1' }]
        sync.mockResolvedValue(true)
        const body = await (await GET()).json()
        expect(sync).toHaveBeenCalledTimes(1)
        expect((sync.mock.calls[0] as unknown[])[0]).toMatchObject({ userId: U })
        expect(body).toMatchObject({ plan: 'pro', adFree: true })
    })

    it('표가 없으면(42P01, PGRST205) 무료', async () => {
        state.user = { id: U }
        for (const code of ['42P01', 'PGRST205']) {
            state.error = { code, message: 'missing' }
            const res = await GET()
            expect(res.status).toBe(200)
            expect(await res.json()).toMatchObject({ plan: 'free' })
        }
    })

    it('그 밖의 읽기 오류는 503 (무료로 잘못 알려 광고를 띄우지 않게 앱이 다시 묻는다)', async () => {
        state.user = { id: U }
        state.error = { code: 'XX000', message: 'boom' }
        const res = await GET()
        expect(res.status).toBe(503)
        expect(res.headers.get('cache-control')).toBe('no-store')
    })
})
