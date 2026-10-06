// GET /api/cron/ai-cost-report — AI 비용 매일 보고. 매일 서울 오전 9시 = UTC 0시(vercel.json).
// 어제(서울)·이번 달 llm_usage 합계를 회사별, 손님/무료/유료별로 기존 보고 관문(슬랙)에 한 장.
// 월 예산 AI_BUDGET_MONTHLY_KRW(선택)가 있으면 「예산 중 몇 %」.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSlackNotification } from '@/lib/slack'
import { buildCostReport, fetchCostRows, kstRanges, parseBudget, CostReportFunctionMissing } from '@/domains/llm/cost-report'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
    const 열쇠 = process.env.CRON_SECRET
    if (!열쇠 || req.headers.get('authorization') !== `Bearer ${열쇠}`) {
        return NextResponse.json({ error: 'no' }, { status: 401 })
    }
    try {
        const db = createAdminClient({ longRunning: true })   // 이번 달 합계는 줄이 많아 5초를 넘길 수 있다
        const now = new Date()
        const r = kstRanges(now)
        const [day, month] = await Promise.all([fetchCostRows(db, r.dayFrom, r.dayTo), fetchCostRows(db, r.monthFrom, now)])
        const text = buildCostReport({ day, month, dayLabel: r.dayLabel, budgetKrw: parseBudget(process.env.AI_BUDGET_MONTHLY_KRW) })
        await sendSlackNotification(text, undefined, { timeoutMs: 5_000 })
        return NextResponse.json({ success: true, text })
    } catch (e) {
        if (e instanceof CostReportFunctionMissing) return NextResponse.json({ success: true, skipped: 'no_function' })
        const message = e instanceof Error ? e.message : String(e)
        console.error('[cron/ai-cost-report] 실패', message)
        return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
}
