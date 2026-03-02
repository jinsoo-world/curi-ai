import { createClient } from '@/lib/supabase/server'
import { getSessionMessages } from '@/domains/chat'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sessions/[sessionId]/messages — 세션 메시지 히스토리 조회
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params

        if (!sessionId || sessionId.startsWith('guest-')) {
            return Response.json({ messages: [] })
        }

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return Response.json({ messages: [] })
        }

        // RLS가 user_id 체크하므로 안전
        const messages = await getSessionMessages(supabase, sessionId)

        return Response.json({
            messages: messages.map((m: any) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                createdAt: m.created_at,
            })),
        })
    } catch (error) {
        console.error('[Sessions Messages API] GET error:', error)
        return Response.json({ messages: [] })
    }
}
