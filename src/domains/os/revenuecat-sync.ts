// domains/os — 레비뉴캣에 직접 물어 요금제를 맞추기 (GET https://api.revenuecat.com/v1/subscribers/{app_user_id})
//
// 언제 부르나
//  ① TRANSFER 알림에서 구독을 넘겨받은 사람 (알림에는 끝나는 날이 없다)
//  ② GET /api/billing/entitlement 에서 무료로 보이는 사람 (로그인 전에 사서 unknown_user 로 남은 알림을 여기서 메운다)
// 같은 사람은 60초에 한 번만 묻는다(서버 한 대 안의 기억, 성공한 조회만 기억, 최대 5,000명).
// 비밀 열쇠 REVENUECAT_SECRET_API_KEY 가 없으면 묻지 않는다. 3초 안에 답이 없으면 끊는다.
// ⚠️ 레비뉴캣은 처음 보는 번호로 물으면 빈 고객을 만든다 → 앱에서 온 요청이거나 레비뉴캣 흔적이 있는 사람만 묻는다(shouldSyncRevenueCat).
import type { SupabaseClient } from '@supabase/supabase-js'
import { planRank, resolvePlan, type PaidPlanId } from './plan'
import { entitlementPlan, RC_KEY_PREFIX, type PlanRowFull, type UserPlanWrite } from './revenuecat'
import { supabaseRcStore } from './revenuecat-service'

export const SYNC_TTL_MS = 60_000
export const SYNC_CACHE_MAX = 5000
export const SYNC_TIMEOUT_MS = 3000

export interface RcSubscriber {
    entitlements: Record<string, { expires_date: string | null; product_identifier: string; grace_period_expires_date?: string | null; store?: string | null }>
    subscriptions: Record<string, { expires_date: string | null; is_sandbox?: boolean; store_transaction_id?: string | null; refunded_at?: string | null; store?: string | null }>
}

/** 살아 있는 권한 중 가장 높은 요금제. 기한 없는 권한(평생)은 우리 상품에 없으므로 받지 않는다 */
export function planFromSubscriber(sub: RcSubscriber, now: Date, allowSandbox: boolean): { plan: PaidPlanId; expiresAt: Date; transactionId: string | null } | null {
    let best: { plan: PaidPlanId; expiresAt: Date; transactionId: string | null } | null = null
    for (const [name, ent] of Object.entries(sub.entitlements ?? {})) {
        const plan = entitlementPlan(name)
        if (!plan || !ent?.expires_date) continue
        const expMs = Math.max(Date.parse(ent.expires_date), ent.grace_period_expires_date ? Date.parse(ent.grace_period_expires_date) : 0)
        if (!Number.isFinite(expMs) || expMs <= now.getTime()) continue
        const subs = sub.subscriptions ?? {}
        const s = Object.hasOwn(subs, ent.product_identifier) ? subs[ent.product_identifier] : undefined
        // 권한에 맞는 구독 줄이 없으면 열지 않는다. 레비뉴캣 화면에서 직접 준 권한(promotional)만 예외
        if (!s && ent.store !== 'promotional') continue
        if (s?.is_sandbox && !allowSandbox) continue
        if (s?.refunded_at) continue
        if (!best || planRank(plan) > planRank(best.plan)) best = { plan, expiresAt: new Date(expMs), transactionId: s?.store_transaction_id ?? null }
    }
    return best
}

export type SyncResult = 'set' | 'ignored' | 'none' | 'cached' | 'not_configured' | 'error'

export interface SyncStore {
    getPlanRow(userId: string): Promise<PlanRowFull | null>
    savePlan(row: UserPlanWrite, expected: PlanRowFull | null): Promise<boolean>
}

/** 레비뉴캣에 물어도 되는 사람인가 (웹에서만 쓰는 무료 회원에게 묻으면 레비뉴캣에 빈 고객이 생긴다) */
export function shouldSyncRevenueCat(a: { fromApp: boolean; planRow: PlanRowFull | null; hasEventTrace: boolean }): boolean {
    return a.fromApp || !!a.planRow?.last_order_id?.startsWith(RC_KEY_PREFIX) || a.hasEventTrace
}

function remember(cache: Map<string, number>, userId: string, at: number) {
    cache.delete(userId) // 다시 넣어 맨 뒤(가장 새것)로
    cache.set(userId, at)
    while (cache.size > SYNC_CACHE_MAX) {
        const oldest = cache.keys().next().value
        if (oldest === undefined) break
        cache.delete(oldest)
    }
}

const defaultCache = new Map<string, number>()

export async function syncRevenueCatUser(a: {
    userId: string
    secret: string | undefined
    allowSandbox: boolean
    store: SyncStore
    fetch?: typeof fetch
    cache?: Map<string, number>
    now?: Date
}): Promise<SyncResult> {
    const now = a.now ?? new Date()
    if (!a.secret) return 'not_configured'
    const cache = a.cache ?? defaultCache
    const last = cache.get(a.userId)
    if (last !== undefined && now.getTime() - last < SYNC_TTL_MS) return 'cached'

    let res: Response
    try {
        res = await (a.fetch ?? fetch)(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(a.userId)}`, {
            headers: { Authorization: `Bearer ${a.secret}`, Accept: 'application/json' },
            cache: 'no-store',
            signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
        })
    } catch (e) {
        console.warn('[revenuecat-sync] 조회 실패(시간 초과 등):', e instanceof Error ? e.message : e)
        return 'error'
    }
    if (res.status === 404) { remember(cache, a.userId, now.getTime()); return 'none' }
    if (!res.ok) {
        console.warn('[revenuecat-sync] 조회 실패:', res.status)
        return 'error'
    }
    const body = await res.json() as { subscriber?: RcSubscriber }
    // 성공한 조회만 기억한다(실패는 바로 다시 물을 수 있게)
    remember(cache, a.userId, now.getTime())
    const hit = body.subscriber ? planFromSubscriber(body.subscriber, now, a.allowSandbox) : null
    if (!hit) return 'none'

    const row = await a.store.getPlanRow(a.userId)
    const cur = resolvePlan(row, now)
    const isTied = !!row?.last_order_id?.startsWith(RC_KEY_PREFIX)
    if (!isTied && cur.plan !== 'free' && planRank(cur.plan) > planRank(hit.plan)) return 'ignored'
    if (cur.plan === hit.plan && cur.expiresAt && Date.parse(cur.expiresAt) >= hit.expiresAt.getTime()) return 'ignored'

    const applied = await a.store.savePlan({
        user_id: a.userId, plan: hit.plan, started_at: now.toISOString(), expires_at: hit.expiresAt.toISOString(),
        last_order_id: `${RC_KEY_PREFIX}sync-${now.getTime()}`, updated_at: now.toISOString(),
        // 레비뉴캣의 지금 상태이므로 지금 시각으로 찍는다 = 이보다 옛 알림은 뒤에 와도 버린다
        rc_event_ms: now.getTime(), rc_transaction_id: hit.transactionId,
    }, row)
    return applied ? 'set' : 'ignored'
}

/** 경로에서 쓰는 모양. 바뀌었으면 true. 앱 요청이 아니고 레비뉴캣 흔적도 없으면 묻지 않는다 */
export async function maybeSyncRevenueCat(a: { userId: string; db: SupabaseClient; fromApp: boolean; planRow: PlanRowFull | null }): Promise<boolean> {
    try {
        const secret = process.env.REVENUECAT_SECRET_API_KEY
        if (!secret) return false
        let hasEventTrace = false
        if (!shouldSyncRevenueCat({ fromApp: a.fromApp, planRow: a.planRow, hasEventTrace: false })) {
            const { data, error } = await a.db.from('revenuecat_events').select('id')
                .or(`user_id.eq.${a.userId},app_user_id.ilike.${a.userId}`).limit(1)
            hasEventTrace = !error && (data ?? []).length > 0
            if (!hasEventTrace) return false
        }
        const r = await syncRevenueCatUser({
            userId: a.userId,
            secret,
            allowSandbox: process.env.REVENUECAT_ALLOW_SANDBOX === '1',
            store: supabaseRcStore(a.db),
        })
        return r === 'set'
    } catch (e) {
        console.warn('[revenuecat-sync] 실패:', e instanceof Error ? e.message : e)
        return false
    }
}
