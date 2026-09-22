// POST /api/os/chat/draft — 「밖으로 내보내는 말」인지 먼저 보고, 맞으면 답 대신 승인 카드를 만든다.
//
// 대화 화면은 말을 보내기 직전에 여기를 한 번 들른다.
//  - card 가 없으면 → 평소대로 /api/chat 으로 가서 봇이 답한다.
//  - card 가 있으면 → 봇은 답하지 않고 「보낼 내용 초안 + 승인 카드」가 말풍선 자리에 뜬다.
// 허용을 눌러도 여기서 보내지 않는다. 기록만 남고, 실제 발신은 발신 담당이 나중에 한다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { classifyByRules, buildIntentPrompt, parseIntentJson, summarizeAction, buildDraftPrompt } from '@/domains/agent/intent'
import type { IrreversibleAction } from '@/domains/agent/tool-gate'
import { gateTool, IRREVERSIBLE_TOOLS } from '@/domains/agent/tool-gate'
import { askSolar } from '@/domains/agent/ask'
import { createPermissionRequest, PermissionTableMissing } from '@/domains/agent/permissions'
import { assertBotOwned } from '@/domains/os/knowledge'
import { SOLAR_CHAT_MODEL } from '@/domains/llm/constants'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** 행동 → 관문에 물어볼 도구 이름 (tool-gate 의 목록을 되짚는다) */
const TOOL_OF_ACTION: Record<IrreversibleAction, string> = {
    send_message: 'send_message',
    publish: 'publish_post',
    purchase: 'purchase',
    transfer: 'transfer_money',
    delete: 'delete_data',
    change_permission: 'change_permission',
    accept_terms: 'accept_terms',
    other: 'unknown_tool',
}

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ card: null })     // 손님은 카드 없이 그냥 대화

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const text = String(body.text ?? '').trim()
    const mentorId = String(body.mentorId ?? '')
    const sessionId = body.sessionId ? String(body.sessionId) : null
    if (!text) return NextResponse.json({ card: null })

    // ① 규칙으로 먼저 본다 (빠르고 공짜)
    const guess = classifyByRules(text)
    let action: IrreversibleAction | 'none' = guess.action
    let to = ''

    // ② 규칙이 애매하면 싼 모델(솔라 미니)에게 한 번 더 묻는다
    if (!guess.confident) {
        const raw = await askSolar('너는 JSON 만 내놓는 분류기다.', buildIntentPrompt(text), { maxTokens: 200 })
        const parsed = raw ? parseIntentJson(raw) : null
        if (parsed) { action = parsed.action; to = parsed.to }
        else if (guess.action === 'none') action = 'none'      // 모델이 못 읽으면 평소대로 대화
    }

    if (action === 'none') return NextResponse.json({ card: null })

    const db = createAdminClient()

    // ③ 내 팀 봇인지 본다. 아니면(공개 봇) 카드에 봇을 적지 않는다
    let ownedMentorId: string | null = null
    let approvalMode: 'always_ask' | 'draft_only' | 'auto_safe' = 'always_ask'
    let botPrompt = ''
    try {
        await assertBotOwned(db, user.id, mentorId)
        ownedMentorId = mentorId
        const { data: tb } = await db
            .from('team_bots')
            .select('approval_mode, mentors(system_prompt)')
            .eq('user_id', user.id).eq('mentor_id', mentorId).maybeSingle()
        const row = tb as unknown as { approval_mode?: typeof approvalMode; mentors?: { system_prompt?: string } | null } | null
        if (row?.approval_mode) approvalMode = row.approval_mode
        botPrompt = row?.mentors?.system_prompt ?? ''
    } catch { /* 공개 봇이거나 표가 아직 없다 — 카드는 그대로 만든다 */ }

    // ④ 관문에 세운다. 초안만 만드는 봇(draft_only)은 카드조차 만들지 않고 「못 한다」고 알린다.
    const gate = gateTool({ tool: TOOL_OF_ACTION[action] ?? 'unknown_tool', approvalMode })
    if (!gate.allowed && !gate.needsApproval) {
        return NextResponse.json({
            card: null,
            blocked: { reason: gate.reason, message: '이 봇은 초안만 만들어요. 보내기·게시 같은 일은 하지 않아요.' },
        })
    }

    // ⑤ 보낼 내용 초안 (모델이 못 답하면 사용자의 말을 그대로 카드에 담는다 — 지어내지 않는다)
    const draft = await askSolar(
        botPrompt || '너는 주인의 AI 팀원이다. 한국어로 짧고 따뜻하게 쓴다.',
        buildDraftPrompt(text, action),
        { model: SOLAR_CHAT_MODEL, temperature: 0.5, maxTokens: 1200 },
    )

    const summary = summarizeAction(action, to)
    try {
        const card = await createPermissionRequest(db, user.id, {
            mentorId: ownedMentorId,
            sessionId,
            actionType: action,
            summary,
            payload: {
                요청한말: text.slice(0, 1000),
                받는사람: to,
                보낼내용: draft ?? '',
                초안못만듦: draft ? undefined : '모델이 답하지 못해 초안을 못 만들었어요. 내용을 고쳐서 허용해 주세요.',
                판정근거: guess.reason,
            },
        })
        return NextResponse.json({ card })
    } catch (e) {
        if (e instanceof PermissionTableMissing) {
            return NextResponse.json({ card: null, tableMissing: true })
        }
        console.error('[os/chat/draft]', e instanceof Error ? e.message : e)
        return NextResponse.json({ card: null })
    }
}

// 목록이 어긋나지 않게 (도구 이름표 8개가 관문 목록에 다 있어야 한다)
if (process.env.NODE_ENV !== 'production') {
    for (const tool of Object.values(TOOL_OF_ACTION)) {
        if (tool !== 'unknown_tool' && !IRREVERSIBLE_TOOLS[tool]) {
            console.warn('[os/chat/draft] 관문 목록에 없는 도구 이름:', tool)
        }
    }
}
