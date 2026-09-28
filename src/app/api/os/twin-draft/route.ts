// POST /api/os/twin-draft = 「내 링크로 만들기」 초안 (저장 안 함). 대표 승인 0928 23:53, 리서치 S3.
// body { links: string[], pastes?: string[], consents: [true, true] }
// 한도: 사용자 하루 5번, 전체 하루 500번 (모델을 부른 요청만 센다)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { cleanDraftLinks, cleanDraftPastes, collectDraftSources, countDraftSources, makeTwinDraft } from '@/domains/os/twin-draft'
import { recordDraftEvent } from '@/domains/os/bot-events'
import { TWIN_DRAFT_COPY, TWIN_DRAFT_GLOBAL_DAILY, TWIN_DRAFT_USER_DAILY } from '@/domains/os/twin-draft-shared'

export const dynamic = 'force-dynamic'
export const maxDuration = 120   // 유튜브 영상 요약(최대 약 40초) + 초안 쓰기

const DAY = 24 * 60 * 60

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const body = await req.json().catch(() => ({})) as { links?: unknown; pastes?: unknown; consents?: unknown }
    // 동의 체크 없앰 (대표 지시 0929): consents 는 받아도 확인하지 않는다
    const links = cleanDraftLinks(body.links)
    const pastes = cleanDraftPastes(body.pastes)
    if (links.length === 0 && pastes.length === 0) return NextResponse.json({ error: '링크를 하나 이상 넣어 주세요' }, { status: 400 })

    const started = Date.now()
    const db = createAdminClient()
    const ev = (name: 'draft_started' | 'draft_succeeded' | 'draft_failed', extra: Record<string, unknown>) =>
        void recordDraftEvent(db, { name, userId: user.id, extra: { ...extra, ms: Date.now() - started } })
    ev('draft_started', { links: links.length, pastes: pastes.length })
    const sources = await collectDraftSources(links, pastes, started + 50_000, user.id)
    if (sources.texts.length === 0) {
        ev('draft_failed', { reason: 'nothing_read', unread: sources.unread.length })
        return NextResponse.json({ error: '읽은 글이 없어요. 글을 붙여넣거나 다른 링크를 넣어 주세요', unread: sources.unread }, { status: 422 })
    }

    const mine = await checkRateLimit(db, `twin-draft:u:${user.id}`, TWIN_DRAFT_USER_DAILY, DAY)
    if (!mine.allowed) { ev('draft_failed', { reason: 'user_limit' }); return NextResponse.json({ error: TWIN_DRAFT_COPY.limit }, { status: 429 }) }
    const all = await checkRateLimit(db, 'twin-draft:all', TWIN_DRAFT_GLOBAL_DAILY, DAY)
    if (!all.allowed) { ev('draft_failed', { reason: 'global_limit' }); return NextResponse.json({ error: TWIN_DRAFT_COPY.busy }, { status: 429 }) }

    const ownerName = String(user.user_metadata?.full_name || user.email?.split('@')[0] || '주인').slice(0, 20)
    try {
        const draft = await makeTwinDraft({ userId: user.id, ownerName, sources })
        ev('draft_succeeded', { counts: countDraftSources(sources.texts), sources: sources.texts.length, unread: sources.unread.length })
        return NextResponse.json({ draft })
    } catch (e) {
        console.error('[os/twin-draft]', e instanceof Error ? e.message : e)
        ev('draft_failed', { reason: 'model', detail: (e instanceof Error ? e.message : String(e)).slice(0, 120) })
        return NextResponse.json({ error: '초안을 만들지 못했어요. 잠시 뒤 다시 해 주세요' }, { status: 502 })
    }
}
