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
 * DELETE /api/sessions/[sessionId] — 세션 삭제 (하드 삭제)
 * admin(service_role) 클라이언트로 RLS 우회. 인증은 별도 확인.
 */
export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params
        
        // 1) 인증 확인 (일반 클라이언트)
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        
        if (!user) {
            return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 })
        }

        // 2) admin 클라이언트로 삭제 (RLS 우회)
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const admin = createAdminClient()

        // 3) 세션 소유자 확인
        const { data: session } = await admin
            .from('chat_sessions')
            .select('id, user_id')
            .eq('id', sessionId)
            .single()

        if (!session) {
            return Response.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 })
        }
        if (session.user_id !== user.id) {
            return Response.json({ error: '권한이 없습니다.' }, { status: 403 })
        }

        // 4) 메시지 먼저 삭제
        const { error: msgErr } = await admin
            .from('messages')
            .delete()
            .eq('session_id', sessionId)

        if (msgErr) {
            console.error('[Sessions DELETE] 메시지 삭제 실패:', msgErr)
        }

        // 5) 세션 삭제
        const { error: sessErr } = await admin
            .from('chat_sessions')
            .delete()
            .eq('id', sessionId)

        if (sessErr) {
            console.error('[Sessions DELETE] 세션 삭제 실패:', sessErr)
            return Response.json({ error: `삭제 실패: ${sessErr.message}` }, { status: 500 })
        }

        console.log(`[Sessions DELETE] 세션 ${sessionId} 삭제 완료 (user: ${user.id})`)
        return Response.json({ ok: true, sessionId })
    } catch (error) {
        console.error('[Sessions DELETE] Error:', error)
        return Response.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
    }
}
