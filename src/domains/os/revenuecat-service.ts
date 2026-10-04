// domains/os — 레비뉴캣 웹훅 처리 (열쇠 확인 → 알림 잡기 → 사람 찾기 → 판단 → 조건부 저장 → 기록)
// 판단은 revenuecat.ts(순수). 여기는 순서와 저장만. 저장소는 바꿔 끼울 수 있게 RcStore 로 받는다(시험이 쉽게).
import type { SupabaseClient } from '@supabase/supabase-js'
import { markFirstPaid } from '@/domains/acquisition/attr'
import {
    claimVerdict, decideRevenueCatEvent, endRevenueCatPlan, eventTime, isAuthorized, isHandledType, isUuid, minimalPayload, pickUserId, RC_KEY_PREFIX,
    type PlanRowFull, type RcDecision, type RcEvent, type UserPlanWrite,
} from './revenuecat'

export interface RcEventRecord {
    id: string
    type: string
    app_user_id: string | null
    user_id: string | null
    environment: string | null
    event_ms: number | null
    outcome: string
    reason: string | null
    /** 판단에 쓴 칸만 (minimalPayload) */
    payload: unknown
    /** 이 처리가 알림을 잡은 시각. 처리 중으로 5분 넘게 멈추면 다음 재전송이 넘겨받는다 */
    claimed_at?: string | null
}

export interface RcStore {
    userExists(userId: string): Promise<boolean>
    getPlanRow(userId: string): Promise<PlanRowFull | null>
    /**
     * 조건부 쓰기. expected = 판단할 때 읽은 줄(없었으면 null).
     *   줄이 있었다 → last_order_id 가 그대로이고(그 사이 토스 결제가 없었고) 반영된 알림 시각이 이 알림보다 새지 않을 때만 고친다
     *   줄이 없었다 → 새로 넣는다. 그 사이 누가 넣었으면 false
     * false 면 부르는 쪽이 한 번 더 읽고 다시 판단한다
     */
    savePlan(row: UserPlanWrite, expected: PlanRowFull | null): Promise<boolean>
    /** 알림을 먼저 잡는다(INSERT … ON CONFLICT DO NOTHING). 있는 줄이면 claimVerdict 로 넘겨받기·바쁨·같은 알림 */
    claimEvent(e: RcEventRecord, now: Date): Promise<'claimed' | 'busy' | 'duplicate'>
    finishEvent(id: string, patch: Pick<RcEventRecord, 'outcome' | 'reason' | 'user_id'>): Promise<void>
    /** 처리 실패 때 잡은 것을 풀어 레비뉴캣이 다시 보내면 처리되게 */
    releaseEvent(id: string): Promise<void>
    /** 처음 결제한 사람이면 시각, 경로, 출처 사본을 적는다 (광고비 판단용). 없어도 되고, 실패해도 결제 처리는 그대로다 */
    markFirstPaid?(userId: string, now: Date): Promise<unknown>
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
 *   401 열쇠 틀림 / 503 서버 열쇠 미설정 / 400 몸통 틀림 / 500 저장 실패(잡은 알림을 풀어 레비뉴캣이 다시 보낸다)
 *   200 그 밖 전부 (처리함·무시함·같은 알림·모르는 회원·샌드박스). 200 이 아니면 레비뉴캣이 계속 다시 보낸다
 * 순서: 열쇠 → 몸통 → 알림 잡기(같은 id 는 한 번만) → 샌드박스 거르기 → 사람 찾기 → 판단 → 조건부 쓰기 → 결과 기록
 */
export async function handleRevenueCatWebhook(a: {
    authHeader: string | null
    body: unknown
    secret: string | undefined
    store: RcStore
    now?: Date
    /** REVENUECAT_ALLOW_SANDBOX === '1' (애플 심사 동안만 켠다) */
    allowSandbox?: boolean
    /** TRANSFER 로 넘겨받은 사람을 레비뉴캣에 물어 맞춘다 (revenuecat-sync.ts) */
    syncUser?: (userId: string) => Promise<unknown>
}): Promise<RcResult> {
    const now = a.now ?? new Date()
    if (!a.secret) return { status: 503, body: { error: 'not_configured' } }
    if (!isAuthorized(a.authHeader, a.secret)) return { status: 401, body: { error: 'unauthorized' } }

    const e = parseEvent(a.body)
    if (!e) return { status: 400, body: { error: 'bad_body' } }

    const { store } = a
    let claimed = false
    try {
        const c = await store.claimEvent({
            id: e.id, type: e.type, app_user_id: e.app_user_id ?? null, user_id: null, environment: e.environment ?? null,
            event_ms: eventTime(e) || null, outcome: 'processing', reason: null, payload: minimalPayload(e), claimed_at: now.toISOString(),
        }, now)
        if (c === 'duplicate') return { status: 200, body: { ok: true, outcome: 'duplicate' } }
        // 다른 처리가 방금 잡고 아직 끝내지 않았다 = 500 으로 돌려보내 레비뉴캣이 나중에 다시 보내게(200 이면 영영 빠진다)
        if (c === 'busy') return { status: 500, body: { error: 'busy' } }
        claimed = true

        const done = async (outcome: string, userId: string | null, reason: string | null, extra: Record<string, unknown> = {}): Promise<RcResult> => {
            await store.finishEvent(e.id, { outcome, reason, user_id: userId })
            return { status: 200, body: { ok: true, outcome, ...(reason ? { reason } : {}), ...extra } }
        }

        if (e.environment === 'SANDBOX' && !a.allowSandbox) return await done('ignored', null, 'sandbox')
        if (!isHandledType(e.type)) return await done('ignored', null, `unhandled:${e.type}`)

        if (e.type === 'TRANSFER') {
            // 넘겨준 사람의 앱 요금제를 닫고, 받은 사람은 레비뉴캣에 물어 맞춘다
            const from = (e.transferred_from ?? []).filter(isUuid).map(x => x.toLowerCase())
            const to = (e.transferred_to ?? []).filter(isUuid).map(x => x.toLowerCase())
            let closed = 0
            for (const uid of from) {
                if (!(await store.userExists(uid))) continue
                const decide = (planRow: PlanRowFull | null) => endRevenueCatPlan({ userId: uid, planRow, key: `${RC_KEY_PREFIX}${e.id}`, now, eventMs: eventTime(e) })
                if ((await applyOnce(store, uid, decide)).outcome === 'set') closed++
            }
            let synced = 0
            for (const uid of to) {
                if (!a.syncUser || !(await store.userExists(uid))) continue
                await a.syncUser(uid)
                synced++
            }
            return await done(closed ? 'set' : 'ignored', from[0] ?? to[0] ?? null, `transfer:closed=${closed},synced=${synced}`, { closed, synced })
        }

        const userId = pickUserId(e)
        if (!userId || !(await store.userExists(userId))) {
            // 로그인 전에 산 구독이면 나중에 그 사람이 로그인해 /api/billing/entitlement 를 부를 때 동기화가 메운다
            console.warn('[revenuecat] 모르는 회원:', e.type, e.id)
            return await done('unknown_user', null, null)
        }

        const r = await applyOnce(store, userId, planRow => decideRevenueCatEvent({ event: e, userId, planRow, now }))
        // 진짜 결제(샌드박스 아님)로 요금제가 열렸으면 처음 결제 기록을 남긴다. 실패해도 이 알림은 정상 처리한다
        if (r.outcome === 'set' && (e.type === 'INITIAL_PURCHASE' || e.type === 'RENEWAL') && e.environment !== 'SANDBOX' && store.markFirstPaid) {
            try { await store.markFirstPaid(userId, now) } catch { /* 계측이 결제 처리를 막지 않는다 */ }
        }
        return await done(r.outcome, userId, r.reason)
    } catch (err) {
        console.error('[revenuecat] 처리 실패:', e.type, e.id, err instanceof Error ? err.message : err)
        if (claimed) await store.releaseEvent(e.id).catch(() => {})
        return { status: 500, body: { error: 'store_failed' } }
    }
}

type ApplyResult = { outcome: 'set' | 'stale' | 'ignored'; reason: string }

/**
 * 읽고 → 판단하고 → 조건부로 쓴다. 쓰기가 막히면(그 사이 다른 알림·토스 결제·새 줄) 한 번 더 읽고 다시 판단해 쓴다.
 * 두 번째도 막히면 stale.
 */
async function applyOnce(store: RcStore, userId: string, decide: (row: PlanRowFull | null) => RcDecision): Promise<ApplyResult> {
    for (let i = 0; i < 2; i++) {
        const row = await store.getPlanRow(userId)
        const d = decide(row)
        if (d.kind === 'ignore') return { outcome: 'ignored', reason: d.reason }
        if (await store.savePlan(d.plan, row)) return { outcome: 'set', reason: d.reason }
    }
    return { outcome: 'stale', reason: 'write_conflict' }
}

/** Supabase(service_role) 저장소. user_plans 는 토스와 같은 표, 알림 기록은 revenuecat_events */
export function supabaseRcStore(db: SupabaseClient): RcStore {
    const must = (error: { message: string } | null, what: string) => { if (error) throw new Error(`${what}: ${error.message}`) }
    return {
        markFirstPaid: (userId, now) => markFirstPaid(db, userId, 'revenuecat', now),
        async userExists(userId) {
            const { data, error } = await db.from('users').select('id').eq('id', userId).maybeSingle()
            must(error, 'users 읽기')
            return !!data
        },
        async getPlanRow(userId) {
            const { data, error } = await db.from('user_plans')
                .select('plan, expires_at, last_order_id, rc_event_ms, rc_transaction_id').eq('user_id', userId).maybeSingle()
            must(error, 'user_plans 읽기')
            return (data as PlanRowFull | null) ?? null
        },
        async savePlan(row, expected) {
            if (expected) {
                // 있는 줄: 읽은 때와 last_order_id 가 같고(그 사이 토스 결제 없음), 반영된 알림 시각이 비었거나 이 알림보다 옛것일 때만
                let q = db.from('user_plans').update(row).eq('user_id', row.user_id)
                q = expected.last_order_id == null ? q.is('last_order_id', null) : q.eq('last_order_id', expected.last_order_id)
                const up = await q.or(`rc_event_ms.is.null,rc_event_ms.lte.${row.rc_event_ms ?? 0}`).select('user_id')
                must(up.error, 'user_plans 고치기')
                return (up.data ?? []).length > 0
            }
            // 줄이 없었다: 새로 넣는다. 그 사이 누가 넣었으면(충돌) false → 부르는 쪽이 다시 읽고 조건부 UPDATE
            const ins = await db.from('user_plans').upsert(row, { onConflict: 'user_id', ignoreDuplicates: true }).select('user_id')
            must(ins.error, 'user_plans 넣기')
            return (ins.data ?? []).length > 0
        },
        async claimEvent(e, now) {
            const ins = await db.from('revenuecat_events').upsert(e, { onConflict: 'id', ignoreDuplicates: true }).select('id')
            must(ins.error, 'revenuecat_events 잡기')
            if ((ins.data ?? []).length > 0) return 'claimed'
            const { data: cur, error } = await db.from('revenuecat_events').select('outcome, claimed_at').eq('id', e.id).maybeSingle()
            must(error, 'revenuecat_events 읽기')
            if (!cur) return 'busy' // 그 사이 풀렸다 = 다시 보내면 잡힌다
            const v = claimVerdict(cur as { outcome: string; claimed_at: string | null }, now)
            if (v !== 'takeover') return v
            // 멈춘 처리를 넘겨받는다. 둘이 동시에 넘겨받지 않게 읽은 claimed_at 이 그대로일 때만
            let q = db.from('revenuecat_events').update({ claimed_at: now.toISOString() }).eq('id', e.id).eq('outcome', 'processing')
            q = cur.claimed_at == null ? q.is('claimed_at', null) : q.eq('claimed_at', cur.claimed_at)
            const take = await q.select('id')
            must(take.error, 'revenuecat_events 넘겨받기')
            return (take.data ?? []).length > 0 ? 'claimed' : 'busy'
        },
        async finishEvent(id, patch) {
            const { error } = await db.from('revenuecat_events').update(patch).eq('id', id)
            must(error, 'revenuecat_events 결과')
        },
        async releaseEvent(id) {
            const { error } = await db.from('revenuecat_events').delete().eq('id', id).eq('outcome', 'processing')
            must(error, 'revenuecat_events 풀기')
        },
    }
}
