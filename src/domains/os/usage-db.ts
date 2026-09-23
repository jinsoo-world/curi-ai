// domains/os — 사용 한도 DB 읽기 (서버 전용. service_role 이라 user_id 를 여기서 건다)
import type { SupabaseClient } from '@supabase/supabase-js'
import { WINDOW_5H_MS, usageView, weekStartKST, type UsageView } from './usage'

/** 이 사람의 대화방들에서, since 이후 사용자가 보낸 메시지 수와 가장 오래된 시각 */
async function countUserTurns(db: SupabaseClient, userId: string, since: Date): Promise<{ count: number; oldest: Date | null }> {
    const { data: sessions } = await db.from('chat_sessions').select('id').eq('user_id', userId)
    const ids = (sessions ?? []).map((s: { id: string }) => s.id)
    if (ids.length === 0) return { count: 0, oldest: null }
    const { data, count } = await db
        .from('messages')
        .select('created_at', { count: 'exact' })
        .in('session_id', ids)
        .eq('role', 'user')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })
        .limit(1)
    const oldest = data && data.length > 0 ? new Date((data[0] as { created_at: string }).created_at) : null
    return { count: count ?? 0, oldest }
}

/** 지금 이 사람의 사용 한도 상태 */
export async function readUsage(db: SupabaseClient, userId: string, now = new Date()): Promise<UsageView> {
    const [w5, wk] = await Promise.all([
        countUserTurns(db, userId, new Date(now.getTime() - WINDOW_5H_MS)),
        countUserTurns(db, userId, weekStartKST(now)),
    ])
    return usageView({ now, used5h: w5.count, oldest5h: w5.oldest, usedWeek: wk.count })
}
