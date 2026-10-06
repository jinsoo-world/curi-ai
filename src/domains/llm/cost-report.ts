// domains/llm — AI 비용 매일 보고 (예약 작업 api/cron/ai-cost-report, 매일 서울 오전 9시).
// llm_usage 의 어제(서울)·이번 달 합계를 회사별, 손님/무료/유료별로 한 장에 담아 기존 보고 관문(lib/slack)으로 보낸다.
// 합계는 DB 함수 llm_cost_report() 가 낸다(20261023 마이그레이션). cost_krw 는 추정값 = 실제 청구는 각 회사 콘솔.
// 월 예산 AI_BUDGET_MONTHLY_KRW 가 있으면 「예산 중 몇 %」를 같이 적는다(분모를 같이 쓴다).
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CostRow { provider: string; segment: 'guest' | 'free' | 'paid' | string; calls: number; cost_krw: number }

const KST = 9 * 3600_000
const SEGMENT: Record<string, string> = { guest: '손님', free: '무료', paid: '유료' }

/** 서울 기준 어제 0시~오늘 0시, 이번 달 1일 0시 */
export function kstRanges(now: Date): { dayFrom: Date; dayTo: Date; monthFrom: Date; dayLabel: string } {
    const k = new Date(now.getTime() + KST)
    const todayStart = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST)
    const dayFrom = new Date(todayStart.getTime() - 86_400_000)
    const monthFrom = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - KST)
    const y = new Date(dayFrom.getTime() + KST)
    return { dayFrom, dayTo: todayStart, monthFrom, dayLabel: `${y.getUTCMonth() + 1}/${y.getUTCDate()}` }
}

export function parseBudget(v: string | undefined): number | null {
    const n = Number(String(v ?? '').replace(/[,_\s]/g, ''))
    return Number.isFinite(n) && n > 0 ? n : null
}

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`

function sumBy(rows: CostRow[], key: 'provider' | 'segment'): Map<string, number> {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + Number(r.cost_krw || 0))
    return m
}

/** 보고 한 장 (순수 함수) */
export function buildCostReport(a: { day: CostRow[]; month: CostRow[]; dayLabel: string; budgetKrw: number | null }): string {
    const dayTotal = a.day.reduce((s, r) => s + Number(r.cost_krw || 0), 0)
    const monthTotal = a.month.reduce((s, r) => s + Number(r.cost_krw || 0), 0)
    const dayCalls = a.day.reduce((s, r) => s + Number(r.calls || 0), 0)
    const lines: string[] = []
    let head = `💸 AI 비용 보고: 어제(${a.dayLabel}) ${won(dayTotal)}, 호출 ${dayCalls.toLocaleString('ko-KR')}번 / 이번 달 ${won(monthTotal)}`
    if (a.budgetKrw) head += ` (월 예산 ${won(a.budgetKrw)} 중 ${((monthTotal / a.budgetKrw) * 100).toFixed(1)}%)`
    lines.push(head)

    const dP = sumBy(a.day, 'provider'), mP = sumBy(a.month, 'provider')
    const providers = [...new Set([...mP.keys(), ...dP.keys()])].sort((x, y) => (mP.get(y) ?? 0) - (mP.get(x) ?? 0))
    lines.push('', '회사별 (어제 / 이번 달)')
    for (const p of providers) lines.push(`  ${p}: ${won(dP.get(p) ?? 0)} / ${won(mP.get(p) ?? 0)}`)

    const dS = sumBy(a.day, 'segment'), mS = sumBy(a.month, 'segment')
    lines.push('', '손님/무료/유료 (어제 / 이번 달)')
    for (const s of ['guest', 'free', 'paid']) lines.push(`  ${SEGMENT[s]}: ${won(dS.get(s) ?? 0)} / ${won(mS.get(s) ?? 0)}`)
    lines.push('', '금액은 추정값이에요. 실제 청구는 각 회사 콘솔이 기준입니다.')
    return lines.join('\n')
}

export class CostReportFunctionMissing extends Error {
    constructor() { super('llm_cost_report 함수가 아직 없다. supabase/migrations/20261023_jobs_payments_resilience.sql 을 실행해야 한다') }
}

export async function fetchCostRows(db: SupabaseClient, from: Date, to: Date): Promise<CostRow[]> {
    const { data, error } = await db.rpc('llm_cost_report', { p_from: from.toISOString(), p_to: to.toISOString() })
    if (error) {
        if (error.code === 'PGRST202' || error.code === '42883') throw new CostReportFunctionMissing()
        throw new Error(error.message)
    }
    return ((data ?? []) as CostRow[]).map(r => ({ ...r, calls: Number(r.calls), cost_krw: Number(r.cost_krw) }))
}
