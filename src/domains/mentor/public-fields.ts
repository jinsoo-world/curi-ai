// domains/mentor — 누구에게나 보여도 되는 봇 칸 (허용 목록)
//
// 봇 지시문(system_prompt), 말투 틀(persona_template, style_template), 성격 꼬리표(personality_traits)는
// 주인만 본다. 로그인 없이 부르는 창구는 반드시 이 목록으로 걸러서 내보낸다.
// 새 칸을 화면에 쓰려면 여기에 더한다(빼먹으면 안 보일 뿐 새지는 않는다).

export const PUBLIC_MENTOR_FIELDS = [
    'id', 'name', 'slug', 'title', 'description', 'avatar_url', 'expertise',
    'greeting_message', 'sample_questions', 'is_premium', 'is_active', 'category',
    'organization', 'handle', 'links', 'chat_theme_color', 'mentor_type', 'price',
    'subscriber_count', 'creator_id', 'voice_sample_url', 'voice_test_url', 'voice_id',
    'pdf_export_enabled', 'status', 'created_at', 'updated_at', 'sort_order',
] as const

export type PublicMentor = Partial<Record<(typeof PUBLIC_MENTOR_FIELDS)[number], unknown>>

/** 봇 행에서 공개 칸만 골라낸다 */
export function toPublicMentor(row: Record<string, unknown>): PublicMentor {
    const out: PublicMentor = {}
    for (const k of PUBLIC_MENTOR_FIELDS) {
        if (k in row) out[k] = row[k]
    }
    return out
}
