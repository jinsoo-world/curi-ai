// domains/os — 레비뉴캣 웹훅 처리 (열쇠 확인 → 같은 알림 거르기 → 사람 찾기 → 판단 → 저장 → 기록)
// 판단은 revenuecat.ts(순수). 여기는 순서와 저장만. 저장소는 바꿔 끼울 수 있게 RcStore 로 받는다(시험이 쉽게).
import type { SupabaseClient } from '@supabase/supabase-js'
import {
    decideRevenueCatEvent, endRevenueCatPlan, isAuthorized, isHandledType, isUuid, pickUserId, RC_KEY_PREFIX,
    type PlanRowFull, type RcDecision, type RcEvent, type UserPlanWrite,
} from './revenuecat'

export interface RcEventRecord {
    id: string
    type: string
    app_user_id: string | null
    user_id: string | null
    environment: string | null
    outcome: string
    reason: string | null
    payload: unknown
}

export interface RcStore {
    userExists(userId: string): Promise<boolean>
    getPlanRow(userId: string): Promise<PlanRowFull | null>
    savePlan(row: UserPlanWrite): Promise<void>
    hasEvent(id: string): Promise<boolean>
    saveEvent(e: RcEventRecord): Promise<void>
}

export interface RcResult {
    status: number
    body: Record<string, unknown>
}

function parseEvent(body: unknown): RcEvent | null {
    if (!body || typeof body !== 'object') return null
    const e = (body as { event?: unknown }).event
    if (!e || typeof e !== 'object') return null
    const ev = e as RcEvent
    if (typeof ev.id !== 'string' || !ev.id || typeof ev.type !== 'string' || !ev.type) return null
    return ev
}

/**
 * 웹훅 한 건.
 *   401 열쇠 틀림 / 503 서버 열쇠 미설정 / 400 몸통 틀림 / 500 저장 실패(레비뉴캣이 다시 보낸다)
 *   200 그 밖 전부 (처리함·무시함·같은 알림·모르는 회원). 200 이 아니면 레비뉴캣이 계속 다시 보낸다
 */
export async function handleRevenueCatWebhook(a: {
    authHeader: string | null
    body: unknown
    secret: string | undefined
    store: RcStore
    now?: Date
}): Promise<RcResult> {
    const now = a.now ?? new Date()
    if (!a.secret) return { status: 503, body: { error: 'not_configured' } }
    if (!isAuthorized(a.authHeader, a.secret)) return { status: 401, body: { error: 'unauthorized' } }

    const e = parseEvent(a.body)
    if (!e) return { status: 400, body: { error: 'bad_body' } }

    const { store } = a
    try {
        if (await store.hasEvent(e.id)) return { status: 200, body: { ok: true, outcome: 'duplicate' } }

        const record = (outcome: string, userId: string | null, reason: string | null): RcEventRecord => ({
            id: e.id, type: e.type, app_user_id: e.app_user_id ?? null, user_id: userId,
            environment: e.environment ?? null, outcome, reason, payload: a.body,
        })

        if (!isHandledType(e.type)) {
            await store.saveEvent(record('ignored', null, `unhandled:${e.type}`))
            return { status: 200, body: { ok: true, outcome: 'ignored' } }
        }

        if (e.type === 'TRANSFER') {
            // 넘겨준 사람의 앱 요금제를 닫는다. 받은 사람은 레비뉴캣의 다음 알림(RENEWAL 등)에서 열린다
            const from = (e.transferred_from ?? []).filter(isUuid).map(x => x.toLowerCase())
            let closed = 0
            for (const uid of from) {
                if (!(await store.userExists(uid))) continue
                const d = endRevenueCatPlan({ userId: uid, planRow: await store.getPlanRow(uid), key: `${RC_KEY_PREFIX}${e.id}`, now })
                if (d.kind === 'set') { await store.savePlan(d.plan); closed++ }
            }
            await store.saveEvent(record(closed ? 'set' : 'ignored', from[0] ?? null, `transfer_closed:${closed}`))
            return { status: 200, body: { ok: true, outcome: closed ? 'set' : 'ignored', closed } }
        }

        const userId = pickUserId(e)
        if (!userId || !(await store.userExists(userId))) {
            console.warn('[revenuecat] 모르는 회원:', e.type, e.id)
            await store.saveEvent(record('unknown_user', null, null))
            return { status: 200, body: { ok: true, outcome: 'unknown_user' } }
        }

        const d: RcDecision = decideRevenueCatEvent({ event: e, userId, planRow: await store.getPlanRow(userId), now })
        if (d.kind === 'set') await store.savePlan(d.plan)
        const outcome = d.kind === 'set' ? 'set' : 'ignored'
        await store.saveEvent(record(outcome, userId, d.reason))
        return { status: 200, body: { ok: true, outcome, reason: d.reason } }
    } catch (err) {
        console.error('[revenuecat] 처리 실패:', e.type, e.id, err instanceof Error ? err.message : err)
        return { status: 500, body: { error: 'store_failed' } }
    }
}

/** Supabase(service_role) 저장소. user_plans 는 토스와 같은 표, 알림 기록은 revenuecat_events */
export function supabaseRcStore(db: SupabaseClient): RcStore {
    const must = (error: { message: string } | null, what: string) => { if (error) throw new Error(`${what}: ${error.message}`) }
    return {
        async userExists(userId) {
            const { data, error } = await db.from('users').select('id').eq('id', userId).maybeSingle()
            must(error, 'users 읽기')
            return !!data
        },
        async getPlanRow(userId) {
            const { data, error } = await db.from('user_plans').select('plan, expires_at, last_order_id').eq('user_id', userId).maybeSingle()
            must(error, 'user_plans 읽기')
            return (data as PlanRowFull | null) ?? null
        },
        async savePlan(row) {
            const { error } = await db.from('user_plans').upsert(row, { onConflict: 'user_id' })
            must(error, 'user_plans 쓰기')
        },
        async hasEvent(id) {
            const { data, error } = await db.from('revenuecat_events').select('id').eq('id', id).maybeSingle()
            must(error, 'revenuecat_events 읽기')
            return !!data
        },
        async saveEvent(e) {
            // 같은 알림이 동시에 두 번 와도 한 줄만 (기간은 「맞추기」라 두 번 처리돼도 늘지 않는다)
            const { error } = await db.from('revenuecat_events').upsert(e, { onConflict: 'id', ignoreDuplicates: true })
            must(error, 'revenuecat_events 쓰기')
        },
    }
}
