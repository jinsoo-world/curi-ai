// /api/creator/mentor/update — 멘토 수정 API
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireMentorOwner } from '@/lib/mentor-owner'
import { 링크정리 } from '@/domains/creator/links'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest) {
    try {
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
            voiceSampleUrl,
            links,
        } = body

        // 🔒 이 AI 의 주인만 통과. 없으면 로그인한 아무나 남의 AI 를 건드릴 수 있다.
        const owner = await requireMentorOwner(mentorId)
        if (!owner.ok) {
            return NextResponse.json({ error: owner.error }, { status: owner.status })
        }
        const admin = owner.admin

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
        if (voiceSampleUrl !== undefined) updateData.voice_sample_url = voiceSampleUrl
        // 개인 SNS 링크 — 대표 지시 2026-09-16
        // ⚠️ 화면에서 한 번 걸렀더라도 서버에서 다시 거른다. 화면을 건너뛰고 직접 부를 수 있다.
        //    javascript: 같은 주소가 통과하면 그 링크를 누른 사람 브라우저에서 코드가 돈다.
        if (links !== undefined) updateData.links = 링크정리(links)
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

        // 멘토 수정 시 목록 페이지 ISR 캐시 즉시 무효화 (아바타, 이름 등 변경 즉시 반영)
        revalidatePath('/mentors')

        return NextResponse.json({ success: true, message: '멘토가 수정되었습니다.' })
    } catch (error: unknown) {
        console.error('[Creator Update API] Error:', error)
        const message = error instanceof Error ? error.message : '멘토 수정 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
