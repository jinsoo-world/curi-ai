// GET /api/cron/feeds — 하루 한 번, 연결된 계정들에서 새 공개 글을 자료로 가져온다.
//
// 열쇠 = CRON_SECRET (Authorization: Bearer …). 없거나 틀리면 거절한다.
// 준비 중(paused, X/Instagram/TikTok)은 건너뛰고, 오래 안 가져온 연결부터 돈다.
// 한 번에 너무 많이 돌면 60초를 넘긴다 → 개수 한도 + 시간 한도. 남은 것은 다음 날 앞줄에 선다.
// 연결 하나가 고장 나도 다른 연결은 계속 돈다(syncFeed 는 던지지 않는다).
// vercel.json: "0 3 * * *" = UTC 3시 = 서울 낮 12시.
// 봇 「내 SNS 연결」로 만든 연결(sns_slot)은 SNS 규칙(요금제 상한)으로 돈다 = syncSnsFeed.
// 인스타그램 (내 SNS 연결): 먼저 60일 열쇠 연장(24시간 지났고 15일 안에 끝나는 것, 190 이면 「다시 연결 필요」)과
//   메타 「정보 삭제 요청」으로 쌓인 삭제 대기를 각자 짧은 시간 한도 안에서 처리한다. 고장 나도 아래 연결 돌기는 계속한다.
// 줄마다 돌기 전에 claimFeedForRun: last_synced_at 을 먼저 찍고(한 줄이 매일 앞줄을 막지 않게), 연결한 사람이 아직 봇 주인인지 다시 본다(아니면 paused).
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listDueFeeds, syncFeed, claimFeedForRun, FeedTableMissing } from '@/domains/os/feeds'
import { syncSnsFeed } from '@/domains/os/bot-sns'
import { readConnectorKey } from '@/domains/connectors/crypto'
import { refreshInstagramTokens, processInstagramDeletions } from '@/domains/os/instagram/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PER_RUN = 30
/** 이 시간을 넘기면 새 연결을 시작하지 않는다 (응답까지 60초 안에) */
const RUN_BUDGET_MS = 50_000

/** 인스타그램 열쇠 연장 최대 10초, 삭제 대기 처리 최대 8초 */
const IG_REFRESH_BUDGET_MS = 10_000
const IG_DELETION_BUDGET_MS = 8_000

async function instagramChores(db: ReturnType<typeof createAdminClient>, started: number) {
    const out: { refreshed?: number; reconnect?: number; deleted?: number; error?: string } = {}
    const key = readConnectorKey()
    try {
        if (key) {
            const r = await refreshInstagramTokens(db, key, { deadline: started + IG_REFRESH_BUDGET_MS, limit: 50 })
            out.refreshed = r.refreshed; out.reconnect = r.reconnect
        }
        const d = await processInstagramDeletions(db, { deadline: Date.now() + IG_DELETION_BUDGET_MS, limit: 10 })
        out.deleted = d.removed
    } catch (e) {
        console.error('[cron/feeds] instagram', e instanceof Error ? e.message : e)
        out.error = '인스타그램 정리를 못 했어요'
    }
    return out
}

export async function GET(req: NextRequest) {
    const 열쇠 = process.env.CRON_SECRET
    if (!열쇠 || req.headers.get('authorization') !== `Bearer ${열쇠}`) {
        return NextResponse.json({ error: 'no' }, { status: 401 })
    }

    const started = Date.now()
    const deadline = started + RUN_BUDGET_MS
    try {
        const db = createAdminClient({ longRunning: true })
        const ig = await instagramChores(db, started)
        const feeds = await listDueFeeds(db, MAX_PER_RUN)
        let ran = 0, 성공 = 0, 실패 = 0, 새자료 = 0, 멈춤 = 0
        for (const feed of feeds) {
            if (Date.now() > deadline - 5_000) break
            if (!(await claimFeedForRun(db, feed))) { 멈춤++; continue }
            const r = feed.snsSlot ? await syncSnsFeed(db, feed, { deadline }) : await syncFeed(db, feed, { deadline })
            ran++
            새자료 += r.added
            if (r.ok) 성공++; else 실패++
        }
        return NextResponse.json({ ok: true, checked: feeds.length, ran, 성공, 실패, 새자료, 멈춤, instagram: ig })
    } catch (e) {
        // 표가 아직 없으면 「준비 중」이지 고장이 아니다
        if (e instanceof FeedTableMissing) return NextResponse.json({ ok: true, ran: 0, note: '계정 연결 표 준비 중' })
        console.error('[cron/feeds]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '계정 연결을 돌리지 못했어요' }, { status: 500 })
    }
}
