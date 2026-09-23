// domains/os — 사용 한도 DB 읽기 (서버 전용. service_role 이라 user_id 를 여기서 건다)
import type { SupabaseClient } from '@supabase/supabase-js'
import { usageView, weekStartKST, type UsageView } from './usage'
import { planLimits, resolvePlan, type PlanId } from './plan'

/** 이 사람의 지금 요금제(없거나 기한 지나면 무료). 표가 없어도 무료로.
 *  관리자 이메일을 pro 한도로 올리지 않는다 — 링 % 가 실제 사용(무료 주 100)으로 움직이게 (대표 지시). */
export async function readPlanId(db: SupabaseClient, userId: string, email?: string | null): Promise<PlanId> {
    void email
    try {
        const { data } = await db.from('user_plans').select('plan, expires_at').eq('user_id', userId).maybeSingle()
        return resolvePlan(data as { plan: string | null; expires_at: string | null } | null).plan
    } catch {
        return 'free'
    }
}

/** 이 사람의 1:1 대화방들에서, since 이후 사용자가 보낸 메시지 수와 가장 오래된 시각 */
async function countSessionUserTurns(db: SupabaseClient, userId: string, since: Date): Promise<{ count: number; oldest: Date | null }> {
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

/** 이 사람 그룹방(channel_messages) — since 이후 사람이 보낸 수 */
async function countChannelUserTurns(db: SupabaseClient, userId: string, since: Date): Promise<number> {
    const { data: channels } = await db.from('channels').select('id').eq('user_id', userId)
    const ids = (channels ?? []).map((c: { id: string }) => c.id)
    if (ids.length === 0) return 0
    try {
        const { count } = await db
            .from('channel_messages')
            .select('id', { count: 'exact', head: true })
            .in('channel_id', ids)
            .eq('author_kind', 'user')
            .gte('created_at', since.toISOString())
        return count ?? 0
    } catch {
        // 표가 아직 없으면 0 (그룹방 미적용 환경)
        return 0
    }
}

/** 1:1 + 그룹방 사람 말을 합쳐 주간 사용량으로 센다 */
async function countUserTurns(db: SupabaseClient, userId: string, since: Date): Promise<{ count: number; oldest: Date | null }> {
    const [session, channelCount] = await Promise.all([
        countSessionUserTurns(db, userId, since),
        countChannelUserTurns(db, userId, since),
    ])
    return { count: session.count + channelCount, oldest: session.oldest }
}

/** 이 사람이 이 봇(mentor)과 나눈 대화만, since 이후 사용자 턴 수 (방문자 1인당 주간 한도용) */
export async function countUserTurnsForMentor(
    db: SupabaseClient,
    userId: string,
    mentorId: string,
    since: Date,
): Promise<number> {
    const { data: sessions } = await db
        .from('chat_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('mentor_id', mentorId)
    const ids = (sessions ?? []).map((s: { id: string }) => s.id)
    if (ids.length === 0) return 0
    const { count } = await db
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('session_id', ids)
        .eq('role', 'user')
        .gte('created_at', since.toISOString())
    return count ?? 0
}

export async function readUsage(db: SupabaseClient, userId: string, now = new Date(), email?: string | null): Promise<UsageView> {
    const [wk, plan] = await Promise.all([
        countUserTurns(db, userId, weekStartKST(now)),
        readPlanId(db, userId, email),
    ])
    const lim = planLimits(plan)
    return usageView({ now, used5h: 0, oldest5h: null, usedWeek: wk.count, limit5h: lim.limit5h, limitWeek: lim.limitWeek })
}
