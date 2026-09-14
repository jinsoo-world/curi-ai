// /api/creator/mentor/detail — 멘토 상세 조회
import { NextRequest, NextResponse } from 'next/server'
import { requireMentorOwner } from '@/lib/mentor-owner'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    try {
        const mentorId = req.nextUrl.searchParams.get('id')

        // 🔒 이 AI 의 주인만 통과. 없으면 로그인한 아무나 남의 AI 를 건드릴 수 있다.
        const owner = await requireMentorOwner(mentorId)
        if (!owner.ok) {
            return NextResponse.json({ error: owner.error }, { status: owner.status })
        }
        const admin = owner.admin

        const { data: mentor, error } = await admin
            .from('mentors')
            .select('id, name, title, description, expertise, system_prompt, greeting_message, sample_questions, is_active, status, mentor_type, creator_id, avatar_url, created_at, category, organization, persona_template, voice_sample_url, voice_id, voice_test_url')
            .eq('id', mentorId)
            .single()

        if (error || !mentor) {
            return NextResponse.json({ error: '멘토를 찾을 수 없습니다.' }, { status: 404 })
        }

        return NextResponse.json({ success: true, mentor })
    } catch (error: unknown) {
        console.error('[Creator Detail API] Error:', error)
        const message = error instanceof Error ? error.message : '멘토 조회 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
