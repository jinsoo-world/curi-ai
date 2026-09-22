// GET /api/cron/routines — 5분마다 와서 「지금 돌 루틴」만 돌린다.
//
// 열쇠 = CRON_SECRET (Authorization: Bearer …). 없거나 틀리면 거절한다.
// 판정은 domains/os/schedule 의 순수 규칙이 한다(시험으로 못 박아 둔 곳).
//   · 예정 시각부터 5분 창 안일 것
//   · 같은 날 같은 시간대에 이미 돌지 않았을 것 (크론이 여러 번 와도 한 번만)
//
// ⚠️ 주기 — Vercel Hobby 요금제는 예약을 **하루 1회**까지만 받는다(5분마다 넣으면 배포가 깨진다).
//    그래서 vercel.json 에는 하루 1회만 넣었다: "0 22 * * *" = UTC 22시 = 서울 아침 7시.
//    진짜 5분 주기는 **바깥 예약 서비스**(cron-job.org 등)에서 같은 주소를 부르면 된다:
//      GET https://…/api/cron/routines   머리글: Authorization: Bearer <CRON_SECRET>   주기: */5 * * * *
//    이 코드는 어느 쪽으로 불려도 똑같이 동작한다(판정은 5분 창 규칙이 한다).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listEnabledRoutines, pickDue, runRoutineOnce, RoutineTableMissing } from '@/domains/os/routines'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 한 번에 너무 많이 돌면 시간이 넘친다. 남은 것은 다음 5분에 잡힌다(창이 5분이라 놓치지 않는다) */
const MAX_PER_RUN = 20

export async function GET(req: NextRequest) {
    const 열쇠 = process.env.CRON_SECRET
    // 열쇠가 없으면 통과시키지 않는다 (proactive·billing 과 같은 규칙)
    if (!열쇠 || req.headers.get('authorization') !== `Bearer ${열쇠}`) {
        return NextResponse.json({ error: 'no' }, { status: 401 })
    }

    const now = new Date()
    try {
        const db = createAdminClient()
        const 켜진것 = await listEnabledRoutines(db)
        const 돌것 = pickDue(켜진것, now).slice(0, MAX_PER_RUN)

        let 성공 = 0, 실패 = 0
        for (const r of 돌것) {
            const res = await runRoutineOnce(db, r)   // 안에서 실패를 삼키고 기록만 남긴다
            if (res.ok) 성공++; else 실패++
        }
        return NextResponse.json({ ok: true, checked: 켜진것.length, ran: 돌것.length, 성공, 실패 })
    } catch (e) {
        // 표가 아직 없으면 「준비 중」이지 고장이 아니다. 빨간 카드를 만들지 않는다.
        if (e instanceof RoutineTableMissing) return NextResponse.json({ ok: true, ran: 0, note: '루틴 표 준비 중' })
        console.error('[cron/routines]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '루틴을 돌리지 못했어요' }, { status: 500 })
    }
}
