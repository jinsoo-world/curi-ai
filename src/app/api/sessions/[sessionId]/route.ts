import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/sessions/[sessionId] — 세션 제목 변경 / 고정 토글
 */
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        const body = await req.json().catch(() => ({}))
        const updates: Record<string, any> = {}

        if (typeof body.title === 'string') {
            updates.title = body.title.trim().slice(0, 100)
        }
        if (typeof body.is_pinned === 'boolean') {
            updates.is_pinned = body.is_pinned
        }

        if (Object.keys(updates).length === 0) {
            return Response.json({ error: '변경할 항목이 없습니다.' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('chat_sessions')
            .update(updates)
            .eq('id', sessionId)
            .eq('user_id', user.id)
            .select()
            .single()

        if (error) {
            console.error('[Sessions PATCH] Error:', error)
            return Response.json({ error: '업데이트에 실패했습니다.' }, { status: 500 })
        }

        return Response.json({ session: data })
    } catch (error) {
        console.error('[Sessions PATCH] Error:', error)
        return Response.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }
}

/**
 * DELETE /api/sessions/[sessionId] — 세션 soft delete (deleted_at 기록)
 * 실제 DB 데이터는 유지하며 유저에게만 숨김. 어드민에서 추적 가능.
 */
export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        // soft delete: deleted_at 타임스탬프 기록
        const { error } = await supabase
            .from('chat_sessions')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', sessionId)
            .eq('user_id', user.id)

        if (error) {
            console.error('[Sessions DELETE] Error:', error)
            // deleted_at 컬럼이 없으면 실제 삭제 (fallback)
            if (error.message?.includes('deleted_at')) {
                const { error: deleteErr } = await supabase
                    .from('chat_sessions')
                    .delete()
                    .eq('id', sessionId)
                    .eq('user_id', user.id)
                if (deleteErr) {
                    return Response.json({ error: '삭제에 실패했습니다.' }, { status: 500 })
                }
            } else {
                return Response.json({ error: '삭제에 실패했습니다.' }, { status: 500 })
            }
        }

        return Response.json({ ok: true, sessionId })
    } catch (error) {
        console.error('[Sessions DELETE] Error:', error)
        return Response.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }
}
