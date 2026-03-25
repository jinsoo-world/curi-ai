// /api/chat/ebook-log — 전자책 다운로드 추적 로깅 API
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return Response.json({ error: '로그인 필요' }, { status: 401 })
        }

        const { sessionId, mentorId, ebookTitle, action } = await req.json()

        if (!action || !['generate', 'download'].includes(action)) {
            return Response.json({ error: 'Invalid action' }, { status: 400 })
        }

        const admin = createAdminClient()

        await admin.from('ebook_logs').insert({
            user_id: user.id,
            session_id: sessionId || null,
            mentor_id: mentorId || null,
            action,
            ebook_title: ebookTitle || null,
        })

        return Response.json({ ok: true })
    } catch (error) {
        console.error('[Ebook Log Error]', error)
        return Response.json({ error: '로깅 실패' }, { status: 500 })
    }
}
