// domains/creator — 비즈니스 로직

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CreateMentorInput, SetPersonaInput, SetKnowledgeInput } from './types'
import { PERSONA_TEMPLATES } from './types'

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
) {
    const slug = `creator-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

    const { data, error } = await db
        .from('mentors')
        .insert({
            creator_id: creatorId,
            mentor_type: 'creator',
            status: 'draft',
            name: input.name,
            slug,
            title: input.title,
            description: input.description,
            expertise: input.expertise,
            avatar_url: input.avatarUrl || null,
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
    return data
}

/**
 * Step 2: 페르소나 설정
 */
export async function setMentorPersona(
    db: SupabaseClient,
    input: SetPersonaInput,
) {
    const template = PERSONA_TEMPLATES.find(t => t.id === input.template)

    const { error } = await db
        .from('mentors')
        .update({
            persona_template: input.template,
            system_prompt: input.systemPrompt || template?.defaultPromptStyle || '',
            greeting_message: input.greetingMessage,
            sample_questions: input.sampleQuestions,
            updated_at: new Date().toISOString(),
        })
        .eq('id', input.mentorId)

    if (error) {
        console.error('[Creator] setMentorPersona error:', error.message)
        throw new Error(error.message)
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
 * 멘토 공개 (draft → review → active)
 * MVP에서는 자동 심사 없이 바로 active
 */
export async function publishMentor(
    db: SupabaseClient,
    mentorId: string,
    creatorId: string,
) {
    const { error } = await db
        .from('mentors')
        .update({
            status: 'active',
            is_active: true,
            updated_at: new Date().toISOString(),
        })
        .eq('id', mentorId)
        .eq('creator_id', creatorId)

    if (error) {
        console.error('[Creator] publishMentor error:', error.message)
        throw new Error(error.message)
    }

    // 크리에이터 mentor_count 증가
    try {
        await db.rpc('increment_mentor_count', { p_creator_id: creatorId })
    } catch {
        // RPC 없으면 무시 (DB function 추가 후 동작)
    }
}
