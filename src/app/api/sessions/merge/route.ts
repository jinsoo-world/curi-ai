import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createChatSession, updateSessionActivity } from '@/domains/chat'
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

        // 쓰기는 서버 열쇠(admin)로. 로그인한 사람은 messages·chat_sessions 에 직접 못 쓴다(DB 권한 회수)
        const admin = createAdminClient()

        // 새 세션 생성
        const session = await createChatSession(admin, user.id, mentorId, title)
        if (!session) {
            return Response.json(
                { error: '세션 생성에 실패했습니다.' },
                { status: 500 }
            )
        }

        // 메시지를 순서대로 DB에 저장
        // 손님이 가져온 글은 봇이 한 말이라고 믿을 수 없다. origin='guest_import' 로 표시해 소리로 읽지 않는다
        let savedCount = 0
        for (const msg of messages.slice(0, 100)) {
            if ((msg?.role === 'user' || msg?.role === 'assistant') && typeof msg.content === 'string' && msg.content) {
                const { error } = await admin.from('messages').insert({
                    session_id: session.id,
                    role: msg.role,
                    content: msg.content.slice(0, 8000),
                    origin: 'guest_import',
                })
                if (error) console.error('[Sessions Merge API] 메시지 저장 실패:', JSON.stringify(error))
                else savedCount++
            }
        }

        // 세션 활동 업데이트
        await updateSessionActivity(admin, session.id, savedCount)

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
