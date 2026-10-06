// domains/chat — AI 비용 안전 스위치 (2026-10-06 「통째로 멈춤」 점검)
//
// GUEST_CHAT_DISABLED=1      → 손님 대화 즉시 정지 (로그인 유도)
// AI_BUDGET_MONTHLY_KRW=숫자 → llm_usage 이번 달(서울 기준) 추정 원가 합계를 1분마다 한 번만 센다.
//                              70% 넘으면 손님 정지, 90% 넘으면 무료 회원도 정지. 유료 회원은 계속.
// 세다가 실패하면 손님만 막고 회원은 통과(돈 내는 사람이 고장 때문에 막히면 안 된다).
// 합계는 DB 함수 llm_usage_month_cost 하나로 센다(행을 서버로 가져오지 않는다).

import type { SupabaseClient } from '@supabase/supabase-js'
import { monthStartKST } from '@/domains/os/usage'

export const BUDGET_GUEST_STOP_PCT = 0.7
export const BUDGET_FREE_STOP_PCT = 0.9
const CACHE_MS = 60_000
const FAIL_CACHE_MS = 15_000

export const GUEST_PAUSED_TEXT = '지금은 손님 대화를 잠시 쉬고 있어요.\n\n로그인하면 이어서 대화할 수 있어요.'
export const FREE_PAUSED_TEXT = '지금은 이용이 많아 무료 대화를 잠시 쉬고 있어요. 잠시 뒤 다시 시도해 주세요.'

export function guestChatDisabled(env: Record<string, string | undefined> = process.env): boolean {
    const v = String(env.GUEST_CHAT_DISABLED ?? '').trim().toLowerCase()
    return v === '1' || v === 'true' || v === 'on'
}

/** 이번 달 AI 예산(원). 안 정했거나 이상한 값이면 null = 예산 스위치 꺼짐 */
export function monthlyBudgetKrw(env: Record<string, string | undefined> = process.env): number | null {
    const v = Number(env.AI_BUDGET_MONTHLY_KRW)
    return Number.isFinite(v) && v > 0 ? v : null
}

let cache: { at: number; month: string; value: number | null } | null = null
/** 시험용: 1분 기억 비우기 */
export function resetBudgetCacheForTest() { cache = null }

/** 이번 달 추정 원가 합계. 실패하면 null. 1분(실패는 15초) 동안 같은 값을 돌려준다 */
export async function monthSpendKrw(db: SupabaseClient, now: Date = new Date()): Promise<number | null> {
    const since = monthStartKST(now).toISOString()
    const t = now.getTime()
    if (cache && cache.month === since && t - cache.at < (cache.value === null ? FAIL_CACHE_MS : CACHE_MS)) return cache.value
    let value: number | null = null
    try {
        const { data, error } = await db.rpc('llm_usage_month_cost', { p_since: since })
        const n = Number(data)
        value = !error && data !== null && data !== undefined && Number.isFinite(n) ? n : null
        if (error) console.warn('[budget] 이번 달 원가 합계 실패:', error.message)
    } catch (e) {
        console.warn('[budget] 이번 달 원가 합계 실패:', e instanceof Error ? e.message : e)
    }
    cache = { at: t, month: since, value }
    return value
}

export type BudgetBlockReason = 'guest_disabled' | 'budget_guest' | 'budget_free' | 'budget_unknown'

/** 순수 판정 (시험하기 쉽게 따로) */
export function budgetDecision(i: { guest: boolean; paid: boolean; budget: number | null; spend: number | null; guestDisabled: boolean }): { allowed: boolean; reason?: BudgetBlockReason } {
    if (i.guest && i.guestDisabled) return { allowed: false, reason: 'guest_disabled' }
    if (i.budget === null || i.paid) return { allowed: true }
    if (i.spend === null) return i.guest ? { allowed: false, reason: 'budget_unknown' } : { allowed: true }
    const pct = i.spend / i.budget
    if (i.guest && pct >= BUDGET_GUEST_STOP_PCT) return { allowed: false, reason: 'budget_guest' }
    if (!i.guest && pct >= BUDGET_FREE_STOP_PCT) return { allowed: false, reason: 'budget_free' }
    return { allowed: true }
}

/** 이 요청이 비용 스위치에 걸리나. 예산을 안 정했으면 DB 를 부르지 않는다 */
export async function checkAiBudget(
    db: SupabaseClient,
    who: { guest: boolean; paid: boolean },
    env: Record<string, string | undefined> = process.env,
    now: Date = new Date(),
): Promise<{ allowed: boolean; reason?: BudgetBlockReason }> {
    const guestDisabled = guestChatDisabled(env)
    const budget = monthlyBudgetKrw(env)
    if (who.guest && guestDisabled) return { allowed: false, reason: 'guest_disabled' }
    if (budget === null || who.paid) return { allowed: true }
    const spend = await monthSpendKrw(db, now)
    return budgetDecision({ ...who, budget, spend, guestDisabled })
}
