// POST /api/os/feeds/sync { mentorId, feedId } → 「지금 가져오기」, 「재연결」 (연결 하나만 한 번 돌린다)
//
// 🔒 첫 줄은 assertBotOwned. 연결은 mentor_id 를 같이 걸어 찾는다(남의 연결 번호를 적어도 안 걸린다).
// 같은 글은 주소로 걸러서 크론과 겹쳐 돌아도 두 번 들어가지 않는다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertBotOwned, BotNotMine } from '@/domains/os/knowledge'
import { getFeed, syncFeed, FeedTableMissing } from '@/domains/os/feeds'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SYNC_BUDGET_MS = 45_000

export async function POST(req: NextRequest) {
    const started = Date.now()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mentorId = String(body.mentorId ?? '')
    const feedId = String(body.feedId ?? '')
    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        const feed = await getFeed(db, mentorId, feedId)
        const sync = await syncFeed(db, feed, { deadline: started + SYNC_BUDGET_MS })
        return NextResponse.json({ sync })
    } catch (e) {
        if (e instanceof BotNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
        if (e instanceof FeedTableMissing) return NextResponse.json({ error: '계정 연결은 준비 중이에요', preparing: true }, { status: 503 })
        const message = e instanceof Error ? e.message : '가져오지 못했어요'
        console.error('[os/feeds/sync]', message)
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
