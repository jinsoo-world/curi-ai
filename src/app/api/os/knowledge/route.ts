// GET    /api/os/knowledge?mentorId=  → 이 봇이 읽은 자료 목록
// POST   /api/os/knowledge            → 자료 넣기 (링크·유튜브·붙여넣은 글·Q&A·짧은 메모), kind=retry 면 못 읽은 자료 다시 읽기
// PATCH  /api/os/knowledge            → 자료 메타 고치기 (한 줄 설명·내가 쓴 글인지)
// DELETE /api/os/knowledge            → 자료 빼기
//
// 🔒 어느 창구든 첫 줄은 「이 봇이 내 팀 봇인가」(team_bots.user_id = 나) 확인이다.
//    서버는 service_role 로 DB 를 만지므로 여기서 안 막으면 남의 봇 자료가 그대로 나간다.
import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    assertBotOwned, assertRoomForMore, listBotSources, addLinkSource, addTextSource, addQaSource,
    updateBotSourceMeta, removeBotSource, retryBotSource, BotNotMine,
} from '@/domains/os/knowledge'
import { addSnsCaptureSource } from '@/domains/os/sns-capture'
import { understandSource, saveUnderstanding, dropUnderstanding } from '@/domains/os/understand'
import { recheckAfterKnowledge } from '@/domains/os/publish-gate'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

function 오류응답(e: unknown) {
    if (e instanceof BotNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
    const message = e instanceof Error ? e.message : '자료를 다루지 못했어요'
    console.error('[os/knowledge]', message)
    return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const mentorId = req.nextUrl.searchParams.get('mentorId') || ''
    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        return NextResponse.json({ sources: await listBotSources(db, mentorId) })
    } catch (e) {
        return 오류응답(e)
    }
}

export async function POST(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mentorId = String(body.mentorId ?? '')
    const kind = String(body.kind ?? '')
    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        // 「다시 시도」: 못 읽은 자료는 자리 셈에 안 들어가니 자리 확인 없이 다시 읽는다
        if (kind === 'retry') {
            return NextResponse.json(await retryBotSource(db, mentorId, String(body.sourceId ?? ''), { userId: user.id }))
        }
        // 「봇이 이렇게 이해했어요」 카드 만들기와 저장 (자리 확인 없음)
        if (kind === 'understand') {
            return NextResponse.json({ understanding: await understandSource(db, mentorId, String(body.sourceId ?? ''), { userId: user.id }) })
        }
        if (kind === 'understand-save') {
            return NextResponse.json(await saveUnderstanding(db, user.id, mentorId, String(body.sourceId ?? ''), body.understanding))
        }
        await assertRoomForMore(db, mentorId)
        // 자료를 넣는 데 성공하면: 공개 중인(또는 확인 대기 중인) 봇은 새 자료까지 AI 가 다시 본다 (응답 뒤)
        const added = (source: unknown) => {
            after(() => recheckAfterKnowledge(db, { mentorId, actorUserId: user.id }))
            return NextResponse.json({ source: { id: (source as { id: string }).id } })
        }

        if (kind === 'sns') {
            // 인스타그램, 페이스북, 스레드: 캡처(글을 옮겨 적음)나 붙여넣은 글
            const source = await addSnsCaptureSource(db, mentorId, { url: body.url, images: body.images, text: body.text, userId: user.id })
            return added(source)
        }
        if (kind === 'url') {
            const source = await addLinkSource(db, mentorId, String(body.url ?? ''), { userId: user.id })
            return added(source)
        }
        if (kind === 'text') {
            const sourceKind = typeof body.sourceKind === 'string' ? body.sourceKind : 'text'
            const source = await addTextSource(db, mentorId, String(body.title ?? ''), String(body.text ?? ''), sourceKind)
            return added(source)
        }
        if (kind === 'qa') {
            // Q&A 직접 쓰기 / CSV 한 줄이 여기로 온다 (sourceKind 로 갈래를 구분). 옛 sourceKind=fix 자료도 읽힌다.
            const source = await addQaSource(db, mentorId, String(body.question ?? ''), String(body.answer ?? ''), {
                context: typeof body.context === 'string' ? body.context : undefined,
                authorIsMe: typeof body.authorIsMe === 'boolean' ? body.authorIsMe : undefined,
                sourceKind: typeof body.sourceKind === 'string' ? body.sourceKind : undefined,
            })
            return added(source)
        }
        return NextResponse.json({ error: '링크나 글 중 하나를 넣어 주세요' }, { status: 400 })
    } catch (e) {
        return 오류응답(e)
    }
}

/** 자료의 메타(무엇인지 한 줄, 내가 쓴 글인지)를 고친다. KnowledgeList 인라인 편집이 부른다 */
export async function PATCH(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mentorId = String(body.mentorId ?? '')
    const sourceId = String(body.sourceId ?? '')
    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        await updateBotSourceMeta(db, mentorId, sourceId, {
            context: typeof body.context === 'string' ? body.context : undefined,
            authorIsMe: typeof body.authorIsMe === 'boolean' ? body.authorIsMe : undefined,
        })
        return NextResponse.json({ ok: true })
    } catch (e) {
        return 오류응답(e)
    }
}

export async function DELETE(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mentorId = String(body.mentorId ?? '')
    const sourceId = String(body.sourceId ?? '')
    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        await removeBotSource(db, mentorId, sourceId)
        // 봇 설명 속 이 자료의 「이해한 내용」 묶음도 뺀다
        await dropUnderstanding(db, mentorId, sourceId).catch(e => console.warn('[os/knowledge] 이해 묶음 빼기 실패', e instanceof Error ? e.message : e))
        return NextResponse.json({ ok: true })
    } catch (e) {
        return 오류응답(e)
    }
}
