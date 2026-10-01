// domains/creator — 비즈니스 로직

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreateMentorInput, SetPersonaInput, SetKnowledgeInput } from './types'
import { PERSONA_TEMPLATES } from './types'
import { recordBotCreated } from '@/domains/os/bot-events'
import { applyBotEdit } from '@/domains/os/publish-gate'
import type { ModerationResult } from '@/domains/os/moderation'

/**
 * 크리에이터 프로필 생성 (없으면 생성, 있으면 반환)
 */
export async function ensureCreatorProfile(
    db: SupabaseClient,
    userId: string,
    displayName: string,
) {
    // 이미 있는지 확인
    const { data: existing } = await db
        .from('creator_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

    if (existing) return existing

    // 없으면 생성
    const { data, error } = await db
        .from('creator_profiles')
        .insert({
            user_id: userId,
            display_name: displayName,
        })
        .select()
        .single()

    if (error) {
        console.error('[Creator] ensureCreatorProfile error:', error.message)
        throw new Error(error.message)
    }
    return data
}

/**
 * Step 1: AI 멘토 초안 생성
 */
export async function createMentorDraft(
    db: SupabaseClient,
    creatorId: string,
    input: CreateMentorInput,
    userId?: string,
) {
    const slug = `creator-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    const { data, error } = await db
        .from('mentors')
        .insert({
            creator_id: creatorId,
            mentor_type: 'creator',
            status: 'draft',
            is_active: false,        // 초안은 비공개. 공개는 publishMentor(공개 관문, AI 확인)로만
            name: input.name,
            slug,
            title: input.title,
            description: input.description,
            expertise: input.expertise,
            avatar_url: input.avatarUrl || null,
            category: input.category || null,
            organization: input.organization || null,
            system_prompt: '',       // Step 2에서 채움
            greeting_message: '',    // Step 2에서 채움
            sample_questions: [],    // Step 2에서 채움
        })
        .select()
        .single()

    if (error) {
        console.error('[Creator] createMentorDraft error:', error.message)
        throw new Error(error.message)
    }
    if (userId && data?.id) await recordBotCreated(db, { path: 'creator_create', mentorId: data.id, userId })
    return data
}

/**
 * Step 2: 페르소나 설정
 */
export async function setMentorPersona(
    db: SupabaseClient,
    input: SetPersonaInput,
    ctx: { creatorId: string; actorUserId: string },
): Promise<{ moderation?: ModerationResult }> {
    const template = input.template ? PERSONA_TEMPLATES.find(t => t.id === input.template) : null

    const updates: Record<string, unknown> = {
        persona_template: input.template || null,
        system_prompt: input.systemPrompt || template?.defaultPromptStyle || '',
        greeting_message: input.greetingMessage,
        sample_questions: input.sampleQuestions,
        updated_at: new Date().toISOString(),
    }
    if (input.chatThemeColor !== undefined) {
        updates.chat_theme_color = input.chatThemeColor || null
    }

    // 지시문, 인사말, 예시 질문은 AI 가 검사하는 칸 = 공개 관문으로 저장한다(공개 중이면 내리고 다시 확인).
    // creatorId 로 묶어 내 봇만 고친다.
    try {
        return await applyBotEdit(db, { mentorId: input.mentorId, creatorId: ctx.creatorId, actorUserId: ctx.actorUserId, fields: updates })
    } catch (e) {
        console.error('[Creator] setMentorPersona error:', e instanceof Error ? e.message : e)
        throw e
    }
}

/**
 * Step 3: 지식 입력
 */
export async function setMentorKnowledge(
    db: SupabaseClient,
    input: SetKnowledgeInput,
) {
    const sources: Array<{ mentor_id: string; source_type: string; title: string; content?: string; original_url?: string }> = []

    if (input.knowledgeText) {
        sources.push({
            mentor_id: input.mentorId,
            source_type: 'text',
            title: '직접 입력 지식',
            content: input.knowledgeText,
        })
    }

    if (input.knowledgeUrls?.length) {
        for (const url of input.knowledgeUrls) {
            sources.push({
                mentor_id: input.mentorId,
                source_type: 'url',
                title: url,
                original_url: url,
            })
        }
    }

    if (sources.length > 0) {
        const { error } = await db
            .from('knowledge_sources')
            .insert(sources)

        if (error) {
            console.error('[Creator] setMentorKnowledge error:', error.message)
            throw new Error(error.message)
        }
    }
}

/**
 * 멘토 공개 (draft → active). 공개는 공개 관문(publish-gate)으로만 = AI 확인 → pass 면 조건부 공개 + 처음만 셈.
 * isPublic=false 면 상태만 active(비공개 봇)로 둔다. 확인 결과(moderation)는 창구가 422/202 로 바꾼다.
 */
export async function publishMentor(
    db: SupabaseClient,
    mentorId: string,
    creatorId: string,
    isPublic: boolean = true,
    actorUserId: string = '',
): Promise<{ moderation?: ModerationResult }> {
    return applyBotEdit(db, {
        mentorId, creatorId, actorUserId,
        fields: { status: 'active', updated_at: new Date().toISOString() },
        wantPublic: isPublic,
    })
}
