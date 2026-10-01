// /api/creator/mentor — AI 멘토 생성 & 업데이트 API
import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import {
    ensureCreatorProfile,
    createMentorDraft,
    setMentorPersona,
    setMentorKnowledge,
    publishMentor,
} from '@/domains/creator'
import { recheckAfterKnowledge } from '@/domains/os/publish-gate'
import { moderationReply } from '@/domains/os/moderation'
import { requireMentorOwner } from '@/lib/mentor-owner'

export const dynamic = 'force-dynamic'
export const maxDuration = 60   // 공개 단계에서 AI 확인(최대 25초)을 기다린다

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
                const { name, title, description, expertise, avatarUrl, category, organization } = body

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
                    category: category || null,
                    organization: organization || null,
                }, user.id)

                return NextResponse.json({ success: true, mentor })
            }

            // ── Step 2: 페르소나 ──
            case 2: {
                const { mentorId, template, systemPrompt, greetingMessage, sampleQuestions, chatThemeColor } = body

                if (!mentorId) {
                    return NextResponse.json(
                        { error: '멘토 ID는 필수입니다.' },
                        { status: 400 },
                    )
                }

                const persona = await setMentorPersona(admin, {
                    mentorId,
                    template: template || null,
                    systemPrompt: systemPrompt || '',
                    greetingMessage: greetingMessage || `안녕하세요! ${body.mentorName || 'AI'}입니다 😊`,
                    sampleQuestions: sampleQuestions || [],
                    chatThemeColor: typeof chatThemeColor === 'string' ? chatThemeColor : chatThemeColor ?? null,
                }, { creatorId: creator.id, actorUserId: user.id })
                // 공개 중인 봇의 지시문을 고쳤으면 다시 확인했다 = 결과를 같은 모양으로 돌려준다
                const personaReply = moderationReply(persona.moderation)
                if (personaReply) return NextResponse.json({ ...personaReply.body, saved: true }, { status: personaReply.status })

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

                // 🔒 이 AI 의 주인만 통과 (다른 크리에이터 창구와 같은 관문). 없으면 남의 AI 에 자료를 심을 수 있었다
                const owner = await requireMentorOwner(mentorId)
                if (!owner.ok) {
                    return NextResponse.json({ error: owner.error }, { status: owner.status })
                }

                await setMentorKnowledge(admin, {
                    mentorId,
                    knowledgeText,
                    knowledgeUrls,
                })

                // 공개 중인(또는 확인 대기 중인) 봇이면 새 자료까지 다시 확인한다 (응답 뒤)
                after(() => recheckAfterKnowledge(admin, { mentorId, actorUserId: user.id }))

                return NextResponse.json({ success: true })
            }

            // ── 발행 ──
            case 'publish': {
                const { mentorId, isPublic } = body

                if (!mentorId) {
                    return NextResponse.json(
                        { error: '멘토 ID는 필수입니다.' },
                        { status: 400 },
                    )
                }

                // 공개 관문 = AI 확인. 막힘 422, 확인 필요 202
                const published = await publishMentor(admin, mentorId, creator.id, isPublic !== false, user.id)
                const reply = moderationReply(published.moderation)
                if (reply) return NextResponse.json(reply.body, { status: reply.status })

                // 해당 크리에이터의 총 AI 수 조회 (보상 제한 체크용)
                const { count: aiCount } = await admin
                    .from('mentors')
                    .select('*', { count: 'exact', head: true })
                    .eq('creator_id', creator.id)
                    .eq('status', 'active')

                return NextResponse.json({ success: true, message: 'AI가 공개되었습니다! 🎉', aiCount: aiCount || 0 })
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
