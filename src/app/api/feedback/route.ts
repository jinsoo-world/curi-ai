import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/feedback
 * 메시지 피드백 저장 (복사/좋아요/아쉬워요)
 */
export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        const { messageId, feedbackType } = await req.json()

        if (!messageId) {
            return new Response(
                JSON.stringify({ error: 'messageId is required' }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
            )
        }

        // feedbackType: 'like' | 'dislike' | null (null = 취소)
        if (feedbackType === null) {
            // 피드백 취소 — 레코드 삭제
            const { error } = await supabase
                .from('message_feedback')
                .delete()
                .match({
                    message_id: messageId,
                    ...(user ? { user_id: user.id } : {}),
                })

            if (error) {
                console.error('Feedback delete error:', error)
            }

            return new Response(
                JSON.stringify({ success: true, action: 'deleted' }),
                { headers: { 'Content-Type': 'application/json' } }
            )
        }

        // 피드백 upsert
        const { error } = await supabase
            .from('message_feedback')
            .upsert({
                message_id: messageId,
                user_id: user?.id || null,
                feedback_type: feedbackType,
                created_at: new Date().toISOString(),
            }, {
                onConflict: 'message_id,user_id',
            })

        if (error) {
            console.error('Feedback upsert error:', error)
            // Non-critical — 피드백 실패해도 200 반환
        }

        return new Response(
            JSON.stringify({ success: true, action: 'saved' }),
            { headers: { 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        console.error('Feedback API error:', error)
        return new Response(
            JSON.stringify({ error: 'Server error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        )
    }
}
