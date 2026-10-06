// POST /api/os/bot-draft = 빠른 봇 초안 (저장 안 함). 대표 확정 1006 「봇 만들기」 2번 누르면 끝.
// body { idea?: string(≤200), job?: string, sourceText?: string(≤5,000), lang?: 'ko'|'en'|'ja' }
// → { name, oneLiner, greeting, sampleQuestions[3], prompt(8칸 틀), promptText, shape, color, job, fallback }
// 앱은 Bearer 로 들어온다(createClient). 손님 401. 한도: 사용자 분당 5번, 하루 30번.
// 만들기는 기존 길 그대로: POST /api/os/team → PATCH /api/os/team/[id] (systemPrompt, greeting, oneLiner) → 추천 질문.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { BOT_DRAFT_PER_DAY, BOT_DRAFT_PER_MINUTE, cleanBotDraftInput, makeBotDraft } from '@/domains/os/bot-draft'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const clean = cleanBotDraftInput(await req.json().catch(() => ({})))
    if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 })

    const db = createAdminClient()
    const minute = await checkRateLimit(db, `bot-draft:m:${user.id}`, BOT_DRAFT_PER_MINUTE, 60)
    if (!minute.allowed) return NextResponse.json({ error: '조금 천천히 해 주세요. 1분 뒤 다시 할 수 있어요' }, { status: 429 })
    const day = await checkRateLimit(db, `bot-draft:d:${user.id}`, BOT_DRAFT_PER_DAY, 24 * 60 * 60)
    if (!day.allowed) return NextResponse.json({ error: '오늘은 초안을 더 만들 수 없어요. 내일 다시 해 주세요' }, { status: 429 })

    const ownerName = String(user.user_metadata?.full_name || '').slice(0, 20)
    const draft = await makeBotDraft({ userId: user.id, ownerName, input: clean.input })
    return NextResponse.json(draft)
}
