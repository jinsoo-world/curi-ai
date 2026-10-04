// 광고비 판단용 집계 읽기 (서버 전용, service_role). 계산은 summarize.ts.
//   방문   = visit_logs (직접 들어온 방문도 2026-10-05 부터 쌓는다)
//   가입   = users.created_at 이 기간 안
//   결제   = 처음 결제한 시각이 기간 안인 사람 (user_plans.first_paid_at, 없으면 payments 와 revenuecat_events 에서 찾는다)
//   출처   = 가입한 사람의 user_onboarding(처음 들어온 길). 결제는 결제할 때 적어 둔 사본이 있으면 그것을 먼저 쓴다
import type { SupabaseClient } from '@supabase/supabase-js'
import { ACQUISITION, labelOf } from '@/domains/os/onboarding'
import { summarize, type Paid, type Signup, type VisitRow } from './summarize'
import { ONB_COLS, fromOnboarding, fromSnapshot, type OnbAttr } from './attr'

type Db = SupabaseClient

const PAGE = 1000
const MAX_ROWS = 50_000

/** PostgREST 는 한 번에 1000줄까지만 준다. 쪽을 넘겨 가며 모은다 */
async function pageAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
    const all: T[] = []
    for (let off = 0; off < MAX_ROWS; off += PAGE) {
        const { data, error } = await build(off, off + PAGE - 1)
        if (error) throw new Error(error.message)
        all.push(...(data ?? []))
        if (!data || data.length < PAGE) break
    }
    return all
}

async function inChunks<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
    const out: T[] = []
    for (let i = 0; i < ids.length; i += 150) {
        const { data, error } = await run(ids.slice(i, i + 150))
        if (error) throw new Error(error.message)
        out.push(...(data ?? []))
    }
    return out
}

export interface Period { startIso: string; endIso: string }

export async function loadPeriod(db: Db, p: Period) {
    const visits = await pageAll<VisitRow>((a, b) =>
        db.from('visit_logs')
            .select('created_at, anon_id, visitor_id, user_id, utm_source, utm_medium, utm_campaign, referrer, ref_code, device, os, app_shell')
            .gte('created_at', p.startIso).lt('created_at', p.endIso).order('created_at', { ascending: true }).range(a, b))

    const users = await pageAll<{ id: string; created_at: string }>((a, b) =>
        db.from('users').select('id, created_at')
            .gte('created_at', p.startIso).lt('created_at', p.endIso).order('created_at', { ascending: true }).range(a, b))

    // 결제: ① user_plans 에 적어 둔 처음 결제 ② 예전 토스 결제표 ③ 앱 구독 알림. 사람마다 가장 이른 것
    const plans = await pageAll<{ user_id: string; first_paid_at: string | null; first_paid_provider: string | null; paid_attribution: unknown }>((a, b) =>
        db.from('user_plans').select('user_id, first_paid_at, first_paid_provider, paid_attribution').not('first_paid_at', 'is', null).range(a, b))
    const pays = await pageAll<{ user_id: string | null; paid_at: string | null; created_at: string }>((a, b) =>
        db.from('payments').select('user_id, paid_at, created_at').eq('status', 'done').not('user_id', 'is', null).range(a, b))
    const rc = await pageAll<{ user_id: string | null; event_ms: number | null; received_at: string; environment: string | null }>((a, b) =>
        db.from('revenuecat_events').select('user_id, event_ms, received_at, environment')
            .eq('outcome', 'set').in('type', ['INITIAL_PURCHASE', 'RENEWAL']).not('user_id', 'is', null).range(a, b))

    const first = new Map<string, { at: string; provider: string; snap: unknown }>()
    const offer = (uid: string | null, at: string | null, provider: string, snap: unknown = null) => {
        if (!uid || !at) return
        const cur = first.get(uid)
        if (!cur || Date.parse(at) < Date.parse(cur.at)) first.set(uid, { at, provider, snap: snap ?? cur?.snap ?? null })
        else if (snap && !cur.snap) cur.snap = snap
    }
    for (const r of plans) offer(r.user_id, r.first_paid_at, r.first_paid_provider || 'toss', r.paid_attribution)
    for (const r of pays) offer(r.user_id, r.paid_at || r.created_at, 'toss')
    for (const r of rc) {
        if (r.environment === 'SANDBOX') continue
        offer(r.user_id, r.event_ms ? new Date(r.event_ms).toISOString() : r.received_at, 'revenuecat')
    }
    const paidIn = [...first.entries()].filter(([, v]) => Date.parse(v.at) >= Date.parse(p.startIso) && Date.parse(v.at) < Date.parse(p.endIso))

    const ids = [...new Set([...users.map(u => u.id), ...paidIn.map(([uid]) => uid)])]
    const onb = ids.length
        ? await inChunks<OnbAttr>(ids, c => db.from('user_onboarding').select(ONB_COLS).in('user_id', c))
        : []
    const onbBy = new Map(onb.map(r => [r.user_id, r]))

    const signups: Signup[] = users.map(u => ({ user_id: u.id, created_at: u.created_at, attr: fromOnboarding(onbBy.get(u.id)) }))
    const paid: Paid[] = paidIn.map(([uid, v]) => {
        const o = onbBy.get(uid)
        return { user_id: uid, at: v.at, provider: v.provider, attr: fromSnapshot(v.snap, o?.acquisition_source ?? null) ?? fromOnboarding(o) }
    })
    return { visits, signups, paid }
}

export async function loadSummary(db: Db, p: Period) {
    const raw = await loadPeriod(db, p)
    return summarize({ ...raw, surveyLabel: id => labelOf(ACQUISITION, id) })
}
