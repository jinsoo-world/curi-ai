// GET /api/cron/syncs — 하루 한 번, 등록된 드라이브/노션 동기화를 돌린다(수정된 것만 새로 넣는다).
//
// 열쇠 = CRON_SECRET (Authorization: Bearer …), routines 크론과 같은 규칙.
// 고르기·차지·실패 횟수·멈춤은 공통 장치(lib/jobs/run-due-batch)가 맡는다:
//   다음 시각(next_run_at)이 된 것만, 오래 밀린 것부터 · 한 건 마감 · 3번 연속 실패면 멈춤 + 알림 한 번.
// 전체 마감 50초(함수 한도 60초). 남은 것은 다음 날 앞줄에 선다.
// 파일 학습은 학습 창구에 맡기고 기다리지 않는다(내부 열쇠로 부른다 = 예전 401 수리).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runDueBatch } from '@/lib/jobs/run-due-batch'
import { createCloudSyncJobStore, isSyncTableMissing, runCloudSync } from '@/domains/os/cloudsync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PER_RUN = 15
const RUN_BUDGET_MS = 50_000
const PER_ITEM_MS = 20_000
/** 하루 한 번 크론이 매번 잡도록 하루보다 조금 짧게 */
const NEXT_RUN_MS = 20 * 3600_000

function appUrl(req: NextRequest): string {
    return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
}

export async function GET(req: NextRequest) {
    const 열쇠 = process.env.CRON_SECRET
    if (!열쇠 || req.headers.get('authorization') !== `Bearer ${열쇠}`) {
        return NextResponse.json({ error: 'no' }, { status: 401 })
    }

    const deadline = Date.now() + RUN_BUDGET_MS
    try {
        const db = createAdminClient({ longRunning: true })
        const base = appUrl(req)
        let 새자료 = 0
        const summary = await runDueBatch({
            name: '드라이브·노션 가져오기',
            store: createCloudSyncJobStore(db),
            limit: MAX_PER_RUN,
            deadline,
            perItemMs: PER_ITEM_MS,
            nextRunAt: (_job, now) => new Date(now.getTime() + NEXT_RUN_MS),
            run: async (row, signal) => {
                const result = await runCloudSync(db, row, base, { signal })
                새자료 += result.itemCount
                if (!result.ok) throw new Error(result.error ?? '동기화하지 못했어요')
            },
        })
        return NextResponse.json({ success: true, ...summary, 새자료 })
    } catch (e) {
        if (isSyncTableMissing(e)) return NextResponse.json({ ok: true, ran: 0, note: '동기화 표 준비 중' })
        console.error('[cron/syncs]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '동기화를 돌리지 못했어요' }, { status: 500 })
    }
}
