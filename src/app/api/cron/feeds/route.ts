// GET /api/cron/feeds — 하루 한 번, 연결된 계정들에서 새 공개 글을 자료로 가져온다.
//
// 열쇠 = CRON_SECRET (Authorization: Bearer …). 없거나 틀리면 거절한다.
// 준비 중(paused, X/Instagram/TikTok)은 건너뛰고, 오래 안 가져온 연결부터 돈다.
// 한 번에 너무 많이 돌면 60초를 넘긴다 → 개수 한도 + 시간 한도. 남은 것은 다음 날 앞줄에 선다.
// 연결 하나가 고장 나도 다른 연결은 계속 돈다(syncFeed 는 던지지 않는다).
// vercel.json: "0 3 * * *" = UTC 3시 = 서울 낮 12시.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listDueFeeds, syncFeed, FeedTableMissing } from '@/domains/os/feeds'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PER_RUN = 30
/** 이 시간을 넘기면 새 연결을 시작하지 않는다 (응답까지 60초 안에) */
const RUN_BUDGET_MS = 50_000

export async function GET(req: NextRequest) {
    const 열쇠 = process.env.CRON_SECRET
    if (!열쇠 || req.headers.get('authorization') !== `Bearer ${열쇠}`) {
        return NextResponse.json({ error: 'no' }, { status: 401 })
    }

    const started = Date.now()
    const deadline = started + RUN_BUDGET_MS
    try {
        const db = createAdminClient()
        const feeds = await listDueFeeds(db, MAX_PER_RUN)
        let ran = 0, 성공 = 0, 실패 = 0, 새자료 = 0
        for (const feed of feeds) {
            if (Date.now() > deadline - 5_000) break
            const r = await syncFeed(db, feed, { deadline })
            ran++
            새자료 += r.added
            if (r.ok) 성공++; else 실패++
        }
        return NextResponse.json({ ok: true, checked: feeds.length, ran, 성공, 실패, 새자료 })
    } catch (e) {
        // 표가 아직 없으면 「준비 중」이지 고장이 아니다
        if (e instanceof FeedTableMissing) return NextResponse.json({ ok: true, ran: 0, note: '계정 연결 표 준비 중' })
        console.error('[cron/feeds]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '계정 연결을 돌리지 못했어요' }, { status: 500 })
    }
}
