// /api/creator/mentor/update — 멘토 수정 API
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const body = await req.json()
        const {
            mentorId,
            name,
            title,
            description,
            expertise,
            systemPrompt,
            greetingMessage,
            sampleQuestions,
            isActive,
            avatarUrl,
            category,
            organization,
            personaTemplate,
        } = body

        if (!mentorId) {
            return NextResponse.json({ error: '멘토 ID는 필수입니다.' }, { status: 400 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 업데이트 데이터 구성
        const updateData: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        }

        if (name !== undefined) updateData.name = name
        if (title !== undefined) updateData.title = title
        if (description !== undefined) updateData.description = description
        if (expertise !== undefined) updateData.expertise = expertise
        if (systemPrompt !== undefined) updateData.system_prompt = systemPrompt
        if (greetingMessage !== undefined) updateData.greeting_message = greetingMessage
        if (sampleQuestions !== undefined) updateData.sample_questions = sampleQuestions
        if (avatarUrl !== undefined) updateData.avatar_url = avatarUrl
        if (category !== undefined) updateData.category = category
        if (organization !== undefined) updateData.organization = organization
        if (personaTemplate !== undefined) updateData.persona_template = personaTemplate
        if (isActive !== undefined) {
            updateData.is_active = isActive
            // 비활성화는 is_active 컬럼으로만 관리
            // status는 활성화 시에만 'active'로 복원 (suspended → active 복구)
            if (isActive) {
                updateData.status = 'active'
            }
            // is_active=false 시 status는 변경하지 않음 (관리 목록에서 유지)
        }

        const { error } = await admin
            .from('mentors')
            .update(updateData)
            .eq('id', mentorId)

        if (error) {
            console.error('[Creator Update] Error:', error.message)
            throw new Error(error.message)
        }

        return NextResponse.json({ success: true, message: '멘토가 수정되었습니다.' })
    } catch (error: unknown) {
        console.error('[Creator Update API] Error:', error)
        const message = error instanceof Error ? error.message : '멘토 수정 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
