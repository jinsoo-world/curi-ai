// /api/creator/mentor — AI 멘토 생성 & 업데이트 API
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import {
    ensureCreatorProfile,
    createMentorDraft,
    setMentorPersona,
    setMentorKnowledge,
    publishMentor,
} from '@/domains/creator'

export const dynamic = 'force-dynamic'

/**
 * POST — AI 멘토 생성 (Step 1~3 + 발행)
 * body: { step, ...stepData }
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const body = await req.json()
        const { step } = body

        // 서비스 롤 클라이언트 (RLS 우회)
        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 크리에이터 프로필 보장
        const creator = await ensureCreatorProfile(
            admin,
            user.id,
            user.user_metadata?.full_name || user.email?.split('@')[0] || '크리에이터',
        )

        switch (step) {
            // ── Step 1: 기본 정보 ──
            case 1: {
                const { name, title, description, expertise, avatarUrl } = body

                if (!name || !title) {
                    return NextResponse.json(
                        { error: 'AI 이름과 한줄 소개는 필수입니다.' },
                        { status: 400 },
                    )
                }

                const mentor = await createMentorDraft(admin, creator.id, {
                    name,
                    title,
                    description: description || '',
                    expertise: expertise || [],
                    avatarUrl: avatarUrl || '',
                })

                return NextResponse.json({ success: true, mentor })
            }

            // ── Step 2: 페르소나 ──
            case 2: {
                const { mentorId, template, systemPrompt, greetingMessage, sampleQuestions } = body

                if (!mentorId) {
                    return NextResponse.json(
                        { error: '멘토 ID는 필수입니다.' },
                        { status: 400 },
                    )
                }

                await setMentorPersona(admin, {
                    mentorId,
                    template: template || null,
                    systemPrompt: systemPrompt || '',
                    greetingMessage: greetingMessage || `안녕하세요! ${body.mentorName || 'AI'}입니다 😊`,
                    sampleQuestions: sampleQuestions || [],
                })

                return NextResponse.json({ success: true })
            }

            // ── Step 3: 지식 입력 ──
            case 3: {
                const { mentorId, knowledgeText, knowledgeUrls } = body

                if (!mentorId) {
                    return NextResponse.json(
                        { error: '멘토 ID는 필수입니다.' },
                        { status: 400 },
                    )
                }

                await setMentorKnowledge(admin, {
                    mentorId,
                    knowledgeText,
                    knowledgeUrls,
                })

                return NextResponse.json({ success: true })
            }

            // ── 발행 ──
            case 'publish': {
                const { mentorId } = body

                if (!mentorId) {
                    return NextResponse.json(
                        { error: '멘토 ID는 필수입니다.' },
                        { status: 400 },
                    )
                }

                await publishMentor(admin, mentorId, creator.id)

                return NextResponse.json({ success: true, message: 'AI가 공개되었습니다! 🎉' })
            }

            default:
                return NextResponse.json({ error: '잘못된 step입니다.' }, { status: 400 })
        }
    } catch (error: unknown) {
        console.error('[Creator API] Error:', error)
        const message = error instanceof Error ? error.message : 'AI 생성 중 오류가 발생했습니다.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
