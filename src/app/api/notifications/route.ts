// api/notifications — 사용자 알림 조회 및 읽음 처리
import { createClient } from '@/lib/supabase/server'
import { getUnreadNotifications, markNotificationRead } from '@/domains/notification'

/**
 * GET: 읽지 않은 알림 목록 조회
 */
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return Response.json({ notifications: [] })
        }

        const notifications = await getUnreadNotifications(supabase, user.id)
        return Response.json({ notifications })
    } catch (error) {
        console.error('[Notifications] GET error:', error)
        return Response.json({ notifications: [] })
    }
}

/**
 * PATCH: 알림 읽음 처리
 * Body: { notificationId: string }
 */
export async function PATCH(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { notificationId } = await req.json()
        if (!notificationId) {
            return Response.json({ error: 'notificationId required' }, { status: 400 })
        }

        await markNotificationRead(supabase, notificationId)
        return Response.json({ success: true })
    } catch (error) {
        console.error('[Notifications] PATCH error:', error)
        return Response.json({ error: 'Failed' }, { status: 500 })
    }
}
