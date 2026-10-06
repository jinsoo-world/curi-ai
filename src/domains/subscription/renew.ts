// domains/subscription — 정기결제 자동 갱신 한 바퀴 (예약 작업 api/billing/renew 가 하루 한 번 부른다).
//
// 「통째로 멈춤」 전수점검 후속(2026-10-06). 지키는 것:
//  ① 먼저 잡기   status active → renewing 을 원자적으로 바꾼 쪽만 결제한다(두 실행이 같은 구독을 동시에 결제하지 못한다).
//                renewing 으로 10분 넘게 남은 줄(결제 중 함수가 죽음)은 다시 잡아 이어서 끝낸다.
//  ② 정해진 주문번호 renew-{구독번호}-{기간 끝 날짜}. 같은 기간을 다시 결제하려 하면 토스가 같은 주문번호를 거절한다 = 두 번 결제 원천 차단.
//     결제 전·실패 뒤에는 그 주문번호로 토스에 물어 이미 결제됐으면(DONE) 결제 없이 DB 만 맞춘다.
//  ③ 결제는 됐는데 DB 반영이 실패하면 past_due(돈 안 냄)로 적지 않는다 → renew_paid_unsynced + 알림.
//  ④ 한 번에 50건, 마감 50초. 남은 것은 다음 날.

import { renewOrderId } from '@/lib/toss'
import type { Subscription } from './types'
import { PLANS } from './types'

export const RENEW_BATCH_LIMIT = 50
export const RENEW_BUDGET_MS = 50_000
/** 토스 결제(10초) + 조회 두 번이 들어갈 자리. 이보다 적게 남으면 새 구독을 시작하지 않는다 */
export const RENEW_PER_ITEM_MS = 12_000
export const RENEW_STALE_MS = 10 * 60_000

export interface ChargeResult {
    paymentKey: string
    orderId: string
    totalAmount: number
    approvedAt: string
    receipt?: { url?: string } | null
}

export interface OrderLookup {
    paymentKey: string
    orderId: string
    status: string
    totalAmount?: number
    approvedAt?: string | null
    receipt?: { url?: string } | null
}

export interface RenewDeps {
    listDue(now: Date, limit: number, staleBefore: Date): Promise<Subscription[]>
    /** active(또는 10분 넘은 renewing) → renewing. 잡았으면 true */
    claim(sub: Subscription, now: Date, staleBefore: Date): Promise<boolean>
    expire(sub: Subscription): Promise<void>
    charge(sub: Subscription, amount: number, orderId: string, orderName: string): Promise<ChargeResult>
    lookupOrder(orderId: string): Promise<OrderLookup | null>
    /** 결제 기록 + 기간 연장 + active */
    markRenewed(sub: Subscription, paid: ChargeResult): Promise<void>
    markPastDue(sub: Subscription): Promise<void>
    markPaidUnsynced(sub: Subscription): Promise<void>
    alert(a: { source: string; error: string; userId?: string; metadata?: Record<string, unknown> }): Promise<void>
}

export interface RenewSummary { picked: number; renewed: number; synced: number; expired: number; failed: number; unsynced: number; uncertain: number; skipped: number; skippedForTime: number }

function asCharge(o: OrderLookup): ChargeResult {
    return { paymentKey: o.paymentKey, orderId: o.orderId, totalAmount: o.totalAmount ?? 0, approvedAt: o.approvedAt ?? new Date().toISOString(), receipt: o.receipt ?? null }
}

/**
 * 결제 오류 판정 (순수 함수).
 *  paid     = 같은 주문번호가 토스에 DONE
 *  declined = 토스가 오류 코드로 확실히 거절했고, 조회가 「없음」 또는 ABORTED·EXPIRED → past_due 로 적어도 된다
 *  uncertain= 그 밖 전부(시간 초과·네트워크·코드 없음·조회 실패·IN_PROGRESS 등) → renewing 유지, 다음에 다시 확인
 */
export function judgeChargeFailure(chargeErr: unknown, lookup: OrderLookup | null | 'error'): 'paid' | 'declined' | 'uncertain' {
    if (lookup && lookup !== 'error' && lookup.status === 'DONE') return 'paid'
    const code = (chargeErr as { code?: unknown } | null)?.code
    const hasCode = typeof code === 'string' && code.length > 0
    if (!hasCode || lookup === 'error') return 'uncertain'
    if (lookup === null || lookup.status === 'ABORTED' || lookup.status === 'EXPIRED') return 'declined'
    return 'uncertain'
}

export async function runRenewals(deps: RenewDeps, opts: { now?: () => Date; deadline?: number; limit?: number } = {}): Promise<RenewSummary> {
    const now = opts.now ?? (() => new Date())
    const deadline = opts.deadline ?? Date.now() + RENEW_BUDGET_MS
    const out: RenewSummary = { picked: 0, renewed: 0, synced: 0, expired: 0, failed: 0, unsynced: 0, uncertain: 0, skipped: 0, skippedForTime: 0 }
    const t0 = now()
    const subs = await deps.listDue(t0, opts.limit ?? RENEW_BATCH_LIMIT, new Date(t0.getTime() - RENEW_STALE_MS))
    out.picked = subs.length

    for (const sub of subs) {
        if (deadline - Date.now() < RENEW_PER_ITEM_MS) { out.skippedForTime++; continue }
        try {
            if (sub.status === 'canceled') {
                await deps.expire(sub)
                out.expired++
                continue
            }
            const t = now()
            if (!(await deps.claim(sub, t, new Date(t.getTime() - RENEW_STALE_MS)))) { out.skipped++; continue }

            const orderId = renewOrderId(sub.id, sub.current_period_end)
            const plan = PLANS[sub.plan_type as 'monthly' | 'annual']
            let paid: ChargeResult | null = null
            let fromLookup = false

            // 결제 중 죽은 줄을 다시 잡은 경우: 이미 결제됐는지 먼저 본다
            if (sub.status === 'renewing') {
                const prior = await deps.lookupOrder(orderId).catch(() => null)
                if (prior && prior.status === 'DONE') { paid = asCharge(prior); fromLookup = true }
            }

            if (!paid) {
                if (!plan) {
                    // 자동 갱신할 수 없는 요금제 = 결제를 시도하지 않은 확실한 실패
                    await deps.markPastDue(sub)
                    await deps.alert({ source: 'billing/renew', error: `자동 갱신할 수 없는 요금제: ${sub.plan_type}`, userId: sub.user_id, metadata: { subscriptionId: sub.id } })
                    out.failed++
                    continue
                }
                try {
                    paid = await deps.charge(sub, plan.price, orderId, `큐리AI ${plan.label} 갱신`)
                } catch (chargeErr) {
                    // 같은 주문번호가 이미 결제됐을 수 있다(앞 실행이 결제 후 죽음, 또는 응답만 늦음) → 토스에 물어 확인
                    let prior: OrderLookup | null | 'error'
                    try { prior = await deps.lookupOrder(orderId) } catch { prior = 'error' }
                    const msg = chargeErr instanceof Error ? chargeErr.message : '갱신 결제 실패'
                    const verdict = judgeChargeFailure(chargeErr, prior)
                    if (verdict === 'paid' && prior && prior !== 'error') {
                        paid = asCharge(prior)
                        fromLookup = true
                    } else if (verdict === 'declined') {
                        await deps.markPastDue(sub)
                        await deps.alert({ source: 'billing/renew', error: msg, userId: sub.user_id, metadata: { subscriptionId: sub.id, orderId } })
                        out.failed++
                        continue
                    } else {
                        // 결제가 됐는지 모른다(시간 초과·네트워크·코드 없음·진행 중) → past_due 로 적지 않고 renewing 으로 둔다.
                        // 다음 실행이 10분 넘은 renewing 을 다시 잡아 같은 주문번호로 확인한다(같은 번호라 두 번 결제되지 않는다)
                        out.uncertain++
                        await deps.alert({ source: 'billing/renew 결제 여부 확인 불가', error: msg, userId: sub.user_id, metadata: { subscriptionId: sub.id, orderId } })
                        continue
                    }
                }
            }

            try {
                await deps.markRenewed(sub, paid)
                if (fromLookup) out.synced++; else out.renewed++
            } catch (dbErr) {
                // 돈은 나갔다. past_due 로 적으면 낸 사람을 못 낸 사람으로 만든다
                const msg = dbErr instanceof Error ? dbErr.message : 'DB 반영 실패'
                await deps.markPaidUnsynced(sub).catch(() => {})
                await deps.alert({ source: 'billing/renew 결제됨·DB반영실패', error: msg, userId: sub.user_id, metadata: { subscriptionId: sub.id, orderId, paymentKey: paid.paymentKey } })
                out.unsynced++
            }
        } catch (e) {
            // 한 구독의 예기치 못한 오류가 나머지를 멈추지 않는다
            out.failed++
            await deps.alert({ source: 'billing/renew', error: e instanceof Error ? e.message : String(e), userId: sub.user_id, metadata: { subscriptionId: sub.id } }).catch(() => {})
        }
    }
    return out
}
