import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/sessions/delete-by-mentor — 특정 멘토와의 모든 대화 soft delete
 * Body: { mentorId: string }
 */
export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const body = await req.json().catch(() => ({}))
        const { mentorId } = body

        if (!mentorId) {
            return Response.json({ error: 'mentorId가 필요합니다.' }, { status: 400 })
        }

        // soft delete: 해당 멘토의 모든 세션에 deleted_at 기록
        const { data, error } = await supabase
            .from('chat_sessions')
            .update({ deleted_at: new Date().toISOString() })
            .eq('user_id', user.id)
            .eq('mentor_id', mentorId)
            .is('deleted_at', null)
            .select('id')

        if (error) {
            console.error('[Sessions Delete By Mentor] Error:', error)
            // deleted_at 컬럼이 없으면 실제 삭제 (fallback)
            if (error.message?.includes('deleted_at')) {
                const { error: deleteErr } = await supabase
                    .from('chat_sessions')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('mentor_id', mentorId)
                if (deleteErr) {
                    return Response.json({ error: '삭제에 실패했습니다.' }, { status: 500 })
                }
                return Response.json({ ok: true, deletedCount: 0, fallback: true })
            }
            return Response.json({ error: '삭제에 실패했습니다.' }, { status: 500 })
        }

        return Response.json({ ok: true, deletedCount: data?.length || 0 })
    } catch (error) {
        console.error('[Sessions Delete By Mentor] Error:', error)
        return Response.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }
}
