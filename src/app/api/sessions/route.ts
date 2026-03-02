import { createClient } from '@/lib/supabase/server'
import { createChatSession } from '@/domains/chat'
import { getMentorById } from '@/domains/mentor'

export const dynamic = 'force-dynamic'

/**
 * POST /api/sessions — 새 채팅 세션 생성
 */
export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        // 게스트 사용자는 임시 세션 (DB 저장 안 함)
        if (!user) {
            return Response.json({
                session: { id: `guest-${crypto.randomUUID()}`, isGuest: true }
            })
        }

        const body = await req.json().catch(() => ({}))
        const { mentorId } = body

        if (!mentorId) {
            return Response.json(
                { error: 'mentorId는 필수입니다.' },
                { status: 400 }
            )
        }

        // 멘토 이름 조회 (domains/mentor)
        const mentor = await getMentorById(supabase, mentorId)
        const title = `${mentor?.name || '멘토'}와의 대화`

        // 세션 생성 (domains/chat)
        const session = await createChatSession(supabase, user.id, mentorId, title)

        if (!session) {
            return Response.json(
                { error: '세션 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' },
                { status: 500 }
            )
        }

        return Response.json({ session })
    } catch (error) {
        console.error('[Sessions API] POST error:', error)
        return Response.json(
            { error: '세션 생성 중 오류가 발생했습니다.' },
            { status: 500 }
        )
    }
}

/**
 * GET /api/sessions — 세션 목록 조회
 */
export async function GET(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return Response.json({ sessions: [] })
        }

        const { searchParams } = new URL(req.url)
        const mentorId = searchParams.get('mentorId')

        let query = supabase
            .from('chat_sessions')
            .select('*, mentors(name, slug, avatar_url)')
            .eq('user_id', user.id)
            .order('last_message_at', { ascending: false, nullsFirst: false })

        if (mentorId) {
            query = query.eq('mentor_id', mentorId)
        }

        const { data: sessions, error } = await query

        if (error) {
            console.error('[Sessions API] GET error:', error)
            return Response.json({ sessions: [] })
        }

        return Response.json({ sessions: sessions || [] })
    } catch (error) {
        console.error('[Sessions API] GET error:', error)
        return Response.json({ sessions: [] })
    }
}
