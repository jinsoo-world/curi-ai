import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkGuestAllowance, cleanVisitorId, guestLogLabel, hashIp, clientIp, guestDailyGlobalCap, GUEST_IP_DAILY_CAP } from '../guest-gate'
import { budgetDecision, checkAiBudget, monthSpendKrw, resetBudgetCacheForTest, guestChatDisabled, monthlyBudgetKrw } from '../budget-gate'

/** guest_chat_logs 세기와 rate_limits 올리기만 흉내 내는 가짜 DB */
function fakeDb(o: {
    logs?: { visitor_id: string; ip_address: string }[]
    countError?: boolean
    rateCounts?: Map<string, number>
    rpcError?: boolean
    monthCost?: number | null
    costError?: boolean
}) {
    const rate = o.rateCounts ?? new Map<string, number>()
    const calls: string[] = []
    const db = {
        calls,
        from(table: string) {
            const filters: Record<string, string> = {}
            const q = {
                select() { return q },
                eq(col: string, v: string) { filters[col] = v; return q },
                gte() { return q },
                lt() { return q },
                then(res: (v: unknown) => unknown) {
                    calls.push(`${table}:${Object.keys(filters).join(',')}`)
                    if (o.countError) return Promise.resolve({ count: null, error: { message: 'timeout' } }).then(res)
                    const n = (o.logs ?? []).filter(l => Object.entries(filters).every(([k, v]) => (l as Record<string, string>)[k] === v)).length
                    return Promise.resolve({ count: n, error: null }).then(res)
                },
            }
            return q
        },
        async rpc(name: string, args: Record<string, unknown>) {
            calls.push(`rpc:${name}`)
            if (name === 'bump_rate_limit') {
                if (o.rpcError) return { data: null, error: { code: 'XX000', message: 'down' } }
                const k = String(args.p_key)
                rate.set(k, (rate.get(k) ?? 0) + 1)
                return { data: rate.get(k), error: null }
            }
            if (name === 'llm_usage_month_cost') {
                if (o.costError) return { data: null, error: { message: 'missing' } }
                return { data: o.monthCost ?? 0, error: null }
            }
            return { data: null, error: { message: 'unknown' } }
        },
    }
    return db as unknown as SupabaseClient & { calls: string[] }
}

describe('손님 문지기', () => {
    const ip = '1.2.3.4'

    it('이름표: 번호가 있으면 번호, 없으면 ip-해시 (세기·저장 같은 이름표)', () => {
        expect(guestLogLabel('visitor_abcdef12', 'h')).toBe('visitor_abcdef12')
        expect(guestLogLabel(null, hashIp(ip))).toBe(`ip-${hashIp(ip)}`)
        expect(hashIp(ip)).toMatch(/^[0-9a-f]{16}$/)
        expect(hashIp(ip)).not.toContain('1.2.3.4')
        expect(cleanVisitorId('짧음')).toBeNull()
        expect(cleanVisitorId('a'.repeat(65))).toBeNull()
        expect(cleanVisitorId('v_1234567890')).toBe('v_1234567890')
    })

    it('IP 는 x-forwarded-for 첫 값', () => {
        const req = new Request('https://x', { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' } })
        expect(clientIp(req)).toBe('9.9.9.9')
    })

    it('본 적 있는 번호는 그 번호로 센다', async () => {
        const logs = Array.from({ length: 7 }, () => ({ visitor_id: 'visitor_seen01', ip_address: '5.5.5.5' }))
        const r = await checkGuestAllowance(fakeDb({ logs }), { visitorId: 'visitor_seen01', ip, maxPerVisitor: 7 })
        expect(r).toMatchObject({ allowed: false, reason: 'visitor_limit' })
    })

    it('번호를 새로 만들어도(오늘 처음 보는 번호) 같은 IP 에서 다 썼으면 막는다', async () => {
        const logs = Array.from({ length: 7 }, (_, i) => ({ visitor_id: `old_visitor_${i}`, ip_address: ip }))
        const r = await checkGuestAllowance(fakeDb({ logs }), { visitorId: 'brand_new_id_1', ip, maxPerVisitor: 7 })
        expect(r).toMatchObject({ allowed: false, reason: 'visitor_limit' })
    })

    it('번호 없이 불러도 IP 로 센다 (예전 unknown 구멍)', async () => {
        const logs = Array.from({ length: 7 }, () => ({ visitor_id: 'fp-deadbeef', ip_address: ip }))
        const r = await checkGuestAllowance(fakeDb({ logs }), { visitorId: undefined, ip, maxPerVisitor: 7 })
        expect(r.allowed).toBe(false)
    })

    it('세다가 실패하면 손님은 막는다', async () => {
        const r = await checkGuestAllowance(fakeDb({ countError: true }), { visitorId: 'visitor_seen01', ip, maxPerVisitor: 7 })
        expect(r).toMatchObject({ allowed: false, reason: 'count_failed' })
        const r2 = await checkGuestAllowance(fakeDb({ rpcError: true }), { visitorId: undefined, ip, maxPerVisitor: 7 })
        expect(r2).toMatchObject({ allowed: false, reason: 'ip_limit' })
    })

    it('IP 하나당 하루 30번', async () => {
        const rate = new Map<string, number>([[`guestday:ip:${hashIp(ip)}`, GUEST_IP_DAILY_CAP]])
        const r = await checkGuestAllowance(fakeDb({ rateCounts: rate }), { visitorId: undefined, ip, maxPerVisitor: 7 })
        expect(r).toMatchObject({ allowed: false, reason: 'ip_limit' })
        // 전체 숫자는 안 올렸다
        expect(rate.get('guestday:all')).toBeUndefined()
    })

    it('손님 전체 하루 상한 (환경변수로 바꾼다)', async () => {
        expect(guestDailyGlobalCap({})).toBe(3000)
        expect(guestDailyGlobalCap({ GUEST_DAILY_GLOBAL_CAP: '5' })).toBe(5)
        const rate = new Map<string, number>([['guestday:all', 5]])
        const r = await checkGuestAllowance(fakeDb({ rateCounts: rate }), { visitorId: undefined, ip, maxPerVisitor: 7, env: { GUEST_DAILY_GLOBAL_CAP: '5' } })
        expect(r).toMatchObject({ allowed: false, reason: 'global_limit' })
    })

    it('다 괜찮으면 통과하고 저장할 이름표를 준다', async () => {
        const r = await checkGuestAllowance(fakeDb({}), { visitorId: undefined, ip, maxPerVisitor: 7 })
        expect(r).toMatchObject({ allowed: true, label: `ip-${hashIp(ip)}` })
    })
})

describe('AI 비용 안전 스위치', () => {
    beforeEach(() => resetBudgetCacheForTest())

    it('스위치 읽기', () => {
        expect(guestChatDisabled({ GUEST_CHAT_DISABLED: '1' })).toBe(true)
        expect(guestChatDisabled({})).toBe(false)
        expect(monthlyBudgetKrw({})).toBeNull()
        expect(monthlyBudgetKrw({ AI_BUDGET_MONTHLY_KRW: '1000000' })).toBe(1_000_000)
    })

    it('판정: 70% 손님 정지, 90% 무료 회원 정지, 유료는 계속', () => {
        const base = { budget: 100, guestDisabled: false }
        expect(budgetDecision({ ...base, guest: true, paid: false, spend: 69 }).allowed).toBe(true)
        expect(budgetDecision({ ...base, guest: true, paid: false, spend: 70 })).toMatchObject({ allowed: false, reason: 'budget_guest' })
        expect(budgetDecision({ ...base, guest: false, paid: false, spend: 89 }).allowed).toBe(true)
        expect(budgetDecision({ ...base, guest: false, paid: false, spend: 90 })).toMatchObject({ allowed: false, reason: 'budget_free' })
        expect(budgetDecision({ ...base, guest: false, paid: true, spend: 500 }).allowed).toBe(true)
    })

    it('합계 실패: 손님만 막고 회원 통과', () => {
        expect(budgetDecision({ guest: true, paid: false, budget: 100, spend: null, guestDisabled: false })).toMatchObject({ allowed: false, reason: 'budget_unknown' })
        expect(budgetDecision({ guest: false, paid: false, budget: 100, spend: null, guestDisabled: false }).allowed).toBe(true)
    })

    it('GUEST_CHAT_DISABLED=1 이면 DB 를 안 보고 손님 정지', async () => {
        const db = fakeDb({})
        const r = await checkAiBudget(db, { guest: true, paid: false }, { GUEST_CHAT_DISABLED: '1' })
        expect(r).toMatchObject({ allowed: false, reason: 'guest_disabled' })
        expect(db.calls).toHaveLength(0)
    })

    it('예산을 안 정했으면 DB 를 안 부른다', async () => {
        const db = fakeDb({})
        expect((await checkAiBudget(db, { guest: true, paid: false }, {})).allowed).toBe(true)
        expect(db.calls).toHaveLength(0)
    })

    it('합계는 1분 동안 한 번만 센다', async () => {
        const db = fakeDb({ monthCost: 10 })
        const now = new Date('2026-10-06T03:00:00Z')
        await monthSpendKrw(db, now)
        await monthSpendKrw(db, new Date(now.getTime() + 30_000))
        expect(db.calls.filter(c => c === 'rpc:llm_usage_month_cost')).toHaveLength(1)
        await monthSpendKrw(db, new Date(now.getTime() + 61_000))
        expect(db.calls.filter(c => c === 'rpc:llm_usage_month_cost')).toHaveLength(2)
    })

    it('합계 함수가 없으면(실패) 손님 막음', async () => {
        const r = await checkAiBudget(fakeDb({ costError: true }), { guest: true, paid: false }, { AI_BUDGET_MONTHLY_KRW: '100' })
        expect(r).toMatchObject({ allowed: false, reason: 'budget_unknown' })
    })
})
