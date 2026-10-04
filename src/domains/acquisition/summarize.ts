// 방문, 가입, 결제를 묶어 센다 (순수 함수). 읽기는 query.ts, 여기는 계산만.
import { campaignOf, channelOf, deviceOf, isAuthReturn, type DeviceLike, type TouchLike } from './labels'

export interface VisitRow extends TouchLike, DeviceLike {
    created_at: string
    anon_id: string | null
    visitor_id?: string | null
    user_id: string | null
}

/** 가입한 사람 한 명의 처음 들어온 길 */
export interface Attribution extends TouchLike, DeviceLike {
    /** 브라우저나 서버가 무엇이라도 적어 둔 줄인가. false 면 추적 전 가입이라 출처를 모른다 */
    tracked: boolean
    /** 가입 설문 「알게 된 경로」 답 */
    survey: string | null
}

export interface Signup { user_id: string; created_at: string; attr: Attribution | null }
export interface Paid { user_id: string; at: string; attr: Attribution | null; provider: string | null }

export type DimensionKey = 'channel' | 'campaign' | 'device' | 'survey'

export interface Cell { key: string; visits: number; visitors: number; signups: number; paid: number }
export interface Totals { visits: number; visitors: number; signups: number; paid: number; untrackedSignups: number }

export const UNTRACKED = '추적 전 가입 (출처 모름)'
export const NO_SURVEY = '설문에 답하지 않음'

function keyFor(dim: DimensionKey, a: Attribution | null, surveyLabel: (id: string) => string): string {
    if (!a || !a.tracked) return dim === 'survey' ? (a?.survey ? surveyLabel(a.survey) : NO_SURVEY) : UNTRACKED
    if (dim === 'channel') return channelOf(a)
    if (dim === 'campaign') return campaignOf(a)
    if (dim === 'device') return deviceOf(a)
    return a.survey ? surveyLabel(a.survey) : NO_SURVEY
}

function visitKey(dim: DimensionKey, v: VisitRow): string | null {
    if (dim === 'survey') return null
    if (dim === 'channel') return channelOf(v)
    if (dim === 'campaign') return campaignOf(v)
    return deviceOf(v)
}

/** 로그인 갔다 돌아온 방문(utm 없음)은 유입이 아니므로 센다 하지 않는다 */
export function countableVisits(rows: VisitRow[]): VisitRow[] {
    return rows.filter(v => !(isAuthReturn(v.referrer) && !(v.utm_source ?? '').trim()))
}

export function summarize(a: { visits: VisitRow[]; signups: Signup[]; paid: Paid[]; surveyLabel?: (id: string) => string }) {
    const surveyLabel = a.surveyLabel ?? (id => id)
    const visits = countableVisits(a.visits)
    const dims: DimensionKey[] = ['channel', 'campaign', 'device', 'survey']
    const out = {} as Record<DimensionKey, Cell[]>
    for (const dim of dims) {
        const m = new Map<string, { visits: number; people: Set<string>; signups: number; paid: number }>()
        const cell = (k: string) => { if (!m.has(k)) m.set(k, { visits: 0, people: new Set(), signups: 0, paid: 0 }); return m.get(k)! }
        visits.forEach((v, i) => {
            const k = visitKey(dim, v)
            if (!k) return
            const c = cell(k)
            c.visits += 1
            c.people.add(v.anon_id || v.visitor_id || `row${i}`)
        })
        for (const s of a.signups) cell(keyFor(dim, s.attr, surveyLabel)).signups += 1
        for (const p of a.paid) cell(keyFor(dim, p.attr, surveyLabel)).paid += 1
        out[dim] = [...m.entries()]
            .map(([key, c]) => ({ key, visits: c.visits, visitors: c.people.size, signups: c.signups, paid: c.paid }))
            .sort((x, y) => (y.paid - x.paid) || (y.signups - x.signups) || (y.visitors - x.visitors) || x.key.localeCompare(y.key, 'ko'))
    }
    const people = new Set<string>()
    visits.forEach((v, i) => people.add(v.anon_id || v.visitor_id || `row${i}`))
    const totals: Totals = {
        visits: visits.length,
        visitors: people.size,
        signups: a.signups.length,
        paid: a.paid.length,
        untrackedSignups: a.signups.filter(s => !s.attr || !s.attr.tracked).length,
    }
    return { totals, ...out }
}

/** 나눗셈. 나누는 수가 0 이면 null (화면에서 줄표 대신 빈칸으로) */
export function rate(n: number, d: number): number | null {
    return d > 0 ? n / d : null
}

export function fmtRate(r: number | null): string {
    if (r == null) return ''
    const p = r * 100
    return `${p >= 10 ? Math.round(p) : Math.round(p * 10) / 10}%`
}
