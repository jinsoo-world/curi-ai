// domains/os — 사용 한도 DB 읽기 (서버 전용. service_role 이라 user_id 를 여기서 건다)
import type { SupabaseClient } from '@supabase/supabase-js'
import { usageView, weekStartKST, type UsageView } from './usage'
import { planLimits, resolvePlan, type PlanId } from './plan'

/** 대표 트윈 판정(9/27) 때문에 관리자는 프로 한도. 관리자 명단은 admin-guard 와 같은 규칙 */
const ADMIN_EMAILS = ['jin@mission-driven.kr', ...(process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)]

/** 이 사람의 지금 요금제(없거나 기한 지나면 무료). 표가 없어도 무료로 */
export async function readPlanId(db: SupabaseClient, userId: string, email?: string | null): Promise<PlanId> {
    if (email && ADMIN_EMAILS.includes(email)) return 'pro'
    try {
        const { data } = await db.from('user_plans').select('plan, expires_at').eq('user_id', userId).maybeSingle()
        return resolvePlan(data as { plan: string | null; expires_at: string | null } | null).plan
    } catch {
        return 'free'
    }
}

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
export async function readUsage(db: SupabaseClient, userId: string, now = new Date(), email?: string | null): Promise<UsageView> {
    const [wk, plan] = await Promise.all([
        countUserTurns(db, userId, weekStartKST(now)),
        readPlanId(db, userId, email),
    ])
    const lim = planLimits(plan)
    return usageView({ now, used5h: 0, oldest5h: null, usedWeek: wk.count, limit5h: lim.limit5h, limitWeek: lim.limitWeek })
}
