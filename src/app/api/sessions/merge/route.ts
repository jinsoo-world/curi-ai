import { createClient } from '@/lib/supabase/server'
import { createChatSession, saveUserMessage, saveAssistantMessage, updateSessionActivity } from '@/domains/chat'
import { getMentorById } from '@/domains/mentor'

export const dynamic = 'force-dynamic'

/**
 * POST /api/sessions/merge — 게스트 대화를 로그인 유저 세션에 이관
 */
export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return Response.json(
                { error: '로그인이 필요합니다.' },
                { status: 401 }
            )
        }

        const { mentorId, messages } = await req.json()

        if (!mentorId || !Array.isArray(messages) || messages.length === 0) {
            return Response.json(
                { error: 'mentorId와 messages가 필요합니다.' },
                { status: 400 }
            )
        }

        // 멘토 이름 조회
        const mentor = await getMentorById(supabase, mentorId)
        const title = `${mentor?.name || '멘토'}와의 대화`

        // 새 세션 생성
        const session = await createChatSession(supabase, user.id, mentorId, title)
        if (!session) {
            return Response.json(
                { error: '세션 생성에 실패했습니다.' },
                { status: 500 }
            )
        }

        // 메시지를 순서대로 DB에 저장
        let savedCount = 0
        for (const msg of messages) {
            if (msg.role === 'user' && msg.content) {
                await saveUserMessage(supabase, session.id, msg.content)
                savedCount++
            } else if (msg.role === 'assistant' && msg.content) {
                await saveAssistantMessage(supabase, session.id, msg.content)
                savedCount++
            }
        }

        // 세션 활동 업데이트
        await updateSessionActivity(supabase, session.id, savedCount)

        return Response.json({
            session,
            mergedCount: savedCount,
        })
    } catch (error) {
        console.error('[Sessions Merge API] error:', error)
        return Response.json(
            { error: '대화 이관 중 오류가 발생했습니다.' },
            { status: 500 }
        )
    }
}
