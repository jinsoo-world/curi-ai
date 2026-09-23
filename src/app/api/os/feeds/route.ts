// GET    /api/os/feeds?mentorId=   → 이 봇에 연결한 계정 목록
// POST   /api/os/feeds             → 계정 연결 { mentorId, kind, handleOrUrl } + 바로 한 번 가져오기
// DELETE /api/os/feeds             → 연결 끊기 { mentorId, feedId, deleteSources }
//
// 🔒 어느 창구든 첫 줄은 「이 봇이 내 팀 봇인가」(assertBotOwned) 확인이다.
//    서버는 service_role 로 DB 를 만지므로 여기서 안 막으면 남의 봇에 연결이 붙는다.
// 표가 아직 없으면(마이그레이션 전) 500 대신 「준비 중」을 돌려준다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertBotOwned, BotNotMine, MAX_SOURCES_PER_BOT } from '@/domains/os/knowledge'
import {
    listFeeds, createFeed, deleteFeed, syncFeed, loadExistingSources, isFeedKind, isSocialStubKind, FeedTableMissing,
} from '@/domains/os/feeds'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 첫 가져오기에 쓰는 시간 (서버 한도 60초 안에서 응답까지 끝나야 한다) */
const FIRST_SYNC_BUDGET_MS = 40_000
const 준비중 = '계정 연결은 준비 중이에요. 잠시 후 다시 해 주세요'

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

function 오류응답(e: unknown) {
    if (e instanceof BotNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
    if (e instanceof FeedTableMissing) return NextResponse.json({ error: 준비중, preparing: true }, { status: 503 })
    const message = e instanceof Error ? e.message : '계정 연결을 다루지 못했어요'
    console.error('[os/feeds]', message)
    return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const mentorId = req.nextUrl.searchParams.get('mentorId') || ''
    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        return NextResponse.json({ feeds: await listFeeds(db, mentorId) })
    } catch (e) {
        // 목록은 표가 없어도 빈 목록 + 안내로 조용히 보여 준다
        if (e instanceof FeedTableMissing) return NextResponse.json({ feeds: [], note: 준비중 })
        return 오류응답(e)
    }
}

export async function POST(req: NextRequest) {
    const started = Date.now()
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mentorId = String(body.mentorId ?? '')
    const kind = body.kind
    const handleOrUrl = String(body.handleOrUrl ?? '')
    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        if (!isFeedKind(kind)) return NextResponse.json({ error: '연결할 곳을 골라 주세요' }, { status: 400 })

        if (!isSocialStubKind(kind)) {
            const { count } = await loadExistingSources(db, mentorId)
            if (count >= MAX_SOURCES_PER_BOT) {
                return NextResponse.json({ error: `자료 칸이 다 찼어요(${MAX_SOURCES_PER_BOT}개). 자료를 빼야 계정을 연결할 수 있어요` }, { status: 400 })
            }
        }

        const feed = await createFeed(db, { userId: user.id, mentorId, kind, handleOrUrl })
        if (isSocialStubKind(kind)) return NextResponse.json({ feed, sync: null })

        // 바로 한 번 가져온다(크리에이터가 뭔가 일어나는 걸 바로 보게). 시간 한도 안에서만
        const sync = await syncFeed(db, feed, { deadline: started + FIRST_SYNC_BUDGET_MS })
        return NextResponse.json({ feed, sync })
    } catch (e) {
        return 오류응답(e)
    }
}

export async function DELETE(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mentorId = String(body.mentorId ?? '')
    const feedId = String(body.feedId ?? '')
    const deleteSources = body.deleteSources === true    // 기본은 남긴다
    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        const r = await deleteFeed(db, mentorId, feedId, deleteSources)
        return NextResponse.json({ ok: true, ...r })
    } catch (e) {
        return 오류응답(e)
    }
}
