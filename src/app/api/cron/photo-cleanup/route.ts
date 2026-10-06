// 48시간 지난 사진을 지운다 — 대표 지시 2026-09-15 「그 이후에는 없어진다고 해」
// 말만 하고 안 지우면 거짓말이 된다. 하루 한 번 새벽 4시에 돈다(vercel.json).
// 하루 한 번인 이유 = 지금 요금제(Hobby)가 하루 1회까지만 예약을 받는다.
// 그래서 실제 파일 삭제는 최대 하루 늦을 수 있지만, 고객에게는 48시간이 지나는 순간
// 목록에서도 사라지고 찾아가기도 막힌다(expires_at 검사). 약속은 지켜진다.
// 100개씩 지우고, 50초 마감, 오류가 있으면 알림. 열쇠(CRON_SECRET)가 없으면 거절(예전엔 열쇠가 없으면 누구나 부를 수 있었다).
import { NextRequest, NextResponse } from 'next/server'
import { 만료된것_지우기 } from '@/lib/photo-store'
import { sendErrorAlert } from '@/lib/slack'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
    const 열쇠 = process.env.CRON_SECRET
    if (!열쇠 || req.headers.get('authorization') !== `Bearer ${열쇠}`) {
        return NextResponse.json({ error: 'no' }, { status: 401 })
    }
    try {
        const r = await 만료된것_지우기({ deadlineMs: Date.now() + 50_000 })
        console.log('[cron/photo-cleanup]', JSON.stringify(r))
        if (r.오류 > 0) await sendErrorAlert({ source: 'cron/photo-cleanup', error: `사진 지우기 오류 ${r.오류}번: ${r.첫오류 ?? ''}` }, { timeoutMs: 3_000 })
        return NextResponse.json({ success: r.오류 === 0, ...r })
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[cron/photo-cleanup] 실패', message)
        await sendErrorAlert({ source: 'cron/photo-cleanup', error: message }, { timeoutMs: 3_000 })
        return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
}
