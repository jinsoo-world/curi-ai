// /api/creator/mentor/update — 멘토 수정 API
import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireMentorOwner } from '@/lib/mentor-owner'
import { 링크정리 } from '@/domains/creator/links'
import { applyBotEdit } from '@/domains/os/publish-gate'
import { moderationReply } from '@/domains/os/moderation'

export const dynamic = 'force-dynamic'
export const maxDuration = 60   // 배포 켜기, 공개 중인 봇 고치기는 AI 확인(최대 25초)을 기다린다

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
        // 배포(is_active)는 여기서 직접 쓰지 않는다 = 공개 관문(publish-gate)만 켠다.
        //   켜기 = AI 확인 → pass 면 조건부 공개(status 도 active 로), 끄기 = 내리고 주인 비공개 기록.
        //   공개 중인 봇의 이름, 소개, 지시문, 인사말, 예시 질문을 고치면 같은 저장에서 내리고 다시 확인한다.
        const { moderation } = await applyBotEdit(admin, {
            mentorId, creatorId: owner.mentor.creator_id, actorUserId: owner.userId,
            fields: updateData,
            wantPublic: typeof isActive === 'boolean' ? isActive : undefined,
        })

        // 멘토 수정 시 목록 페이지 ISR 캐시 즉시 무효화 (아바타, 이름 등 변경 즉시 반영)
        revalidatePath('/mentors')

        const reply = moderationReply(moderation)
        if (reply) return NextResponse.json({ ...reply.body, saved: true }, { status: reply.status })

        return NextResponse.json({ success: true, message: '멘토가 수정되었습니다.' })
    } catch (error: unknown) {
        console.error('[Creator Update API] Error:', error)
        const message = error instanceof Error ? error.message : '멘토 수정 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
