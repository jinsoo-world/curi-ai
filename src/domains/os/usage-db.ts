// domains/os — 사용 한도 DB 읽기 (서버 전용. service_role 이라 user_id 를 여기서 건다)
import type { SupabaseClient } from '@supabase/supabase-js'
import { usageCountFrom, usageView, type UsageView } from './usage'
import { planLimits, resolvePlan, type PlanId } from './plan'

/** 이 사람의 지금 요금제(없거나 기한 지나면 무료). 표가 없어도 무료로.
 *  관리자 이메일을 pro 한도로 올리지 않는다. 링 % 가 실제 사용으로 움직이게 (대표 지시). */
export async function readPlanId(db: SupabaseClient, userId: string, email?: string | null): Promise<PlanId> {
    return (await readPlanIdChecked(db, userId, email)).plan
}

/** 요금제 + 읽기에 성공했는지. 실패(시간 초과 등)면 ok=false — 한도 판정에서 막지 않고 통과시킨다 */
async function readPlanIdChecked(db: SupabaseClient, userId: string, email?: string | null): Promise<{ plan: PlanId; ok: boolean }> {
    void email
    try {
        const { data, error } = await db.from('user_plans').select('plan, expires_at').eq('user_id', userId).maybeSingle()
        if (error) return { plan: 'free', ok: false }
        return { plan: resolvePlan(data as { plan: string | null; expires_at: string | null } | null).plan, ok: true }
    } catch {
        return { plan: 'free', ok: false }
    }
}

/**
 * DB 함수 count_user_turns 한 번으로 센다 (20261023 마이그레이션).
 * 예전엔 대화방 id 를 전부 읽어 주소(.in)에 넣었다 — 대화방이 많으면 주소가 너무 길어 실패하고 느렸다.
 * 함수가 없거나 실패하면 null → 옛 방식으로 센다.
 */
async function countTurnsRpc(db: SupabaseClient, userId: string, since: Date, mentorId: string | null): Promise<{ count: number; oldest: Date | null } | null> {
    try {
        const { data, error } = await db.rpc('count_user_turns', { p_user: userId, p_since: since.toISOString(), p_mentor: mentorId })
        if (error) {
            if (error.code !== 'PGRST202' && error.code !== '42883') console.warn('[usage] count_user_turns 실패, 옛 방식으로:', error.code ?? error.message)
            return null
        }
        const row = (Array.isArray(data) ? data[0] : data) as { turns?: number | string | null; oldest?: string | null } | null
        if (!row) return { count: 0, oldest: null }
        const n = Number(row.turns ?? 0)
        return { count: Number.isFinite(n) ? n : 0, oldest: row.oldest ? new Date(row.oldest) : null }
    } catch {
        return null
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

/** 1:1 + 그룹방 사람 말을 합쳐 사용량으로 센다 */
async function countUserTurns(db: SupabaseClient, userId: string, since: Date): Promise<{ count: number; oldest: Date | null }> {
    const viaRpc = await countTurnsRpc(db, userId, since, null)
    if (viaRpc) return viaRpc
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
    const viaRpc = await countTurnsRpc(db, userId, since, mentorId)
    if (viaRpc) return viaRpc.count
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
    // 대표 결정 0928: 월간 한도 하나. 이번 달 1일 0시(서울)부터, 단 월간으로 바꾼 시점 전 대화는 빼고 센다
    const [turns, plan] = await Promise.all([
        countUserTurns(db, userId, usageCountFrom(now)),
        readPlanIdChecked(db, userId, email),
    ])
    const view = usageView({ now, used: turns.count, limit: planLimits(plan.plan).limitMonth, plan: plan.plan })
    // 요금제를 못 읽었으면 막지 않고 통과 (유료 회원이 DB 고장 때문에 무료 한도로 막히면 안 된다)
    return plan.ok ? view : { ...view, blocked: false, planUnknown: true }
}
