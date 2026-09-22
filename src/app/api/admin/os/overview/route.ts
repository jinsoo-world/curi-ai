// GET /api/admin/os/overview — 관리자 「봇 OS」 한눈에 보기 숫자
//
// - 관리자만(requireAdminAPI). DB 는 service_role 로 읽는다(RLS 우회).
// - 표가 아직 없으면(42P01) 그 칸은 null 로 두고 죽지 않는다. 다른 오류도 그 칸만 null.
// - 개인정보(본문·이메일·전화·payload) 는 아예 select 하지 않는다. 사용자 id 는 앞 8자, 요약은 60자.
// - 환경변수는 「있다/없다」만. 값은 절대 응답에 안 담는다.

import { NextResponse } from 'next/server'
import { requireAdminAPI } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { pickDriverFromEnv } from '@/domains/llm/driver'
import {
    isTableMissing, startOfTodayKst, todayKstDate, daysAgoIso, shortId, truncate,
    teamStats, approvalStats, checkinStats, nextStepStats, messageStats, rateLimitTop, envPresence,
} from '@/domains/os/admin-stats'

export const dynamic = 'force-dynamic'

/** 드라이버 상태로 보여줄 환경변수 이름(있다/없다만) */
const DRIVER_ENV_NAMES = ['UPSTAGE_API_KEY', 'LLM_DRIVER', 'LLM_MODEL_CHAT', 'LLM_MODEL_MINI', 'GEMINI_API_KEY'] as const

interface QueryOut<T> {
    rows: T[] | null            // null = 표가 없거나 읽기 실패
    missing: boolean            // 표 자체가 없음(42P01)
    error: string | null        // 표는 있는데 다른 이유로 실패
}

/** 한 표를 읽는다. 실패해도 throw 하지 않고 그 칸만 null */
async function q<T>(table: string, run: () => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<QueryOut<T>> {
    try {
        const { data, error } = await run()
        if (error) {
            if (isTableMissing(error)) return { rows: null, missing: true, error: null }
            console.warn(`[admin/os/overview] ${table} 읽기 실패`, error.code, error.message)
            return { rows: null, missing: false, error: error.code || 'error' }
        }
        return { rows: (data as T[]) || [], missing: false, error: null }
    } catch (e) {
        console.warn(`[admin/os/overview] ${table} 예외`, e instanceof Error ? e.message : e)
        return { rows: null, missing: false, error: 'exception' }
    }
}

export async function GET() {
    const auth = await requireAdminAPI()
    if (auth.error) {
        return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const db = createAdminClient()
    const now = Date.now()
    const todayIso = startOfTodayKst(now)
    const todayDate = todayKstDate(now)
    const weekIso = daysAgoIso(now, 7)
    const hourIso = new Date(now - 3600_000).toISOString()

    const [bots, approvals, recentApprovals, checkins, nextSteps, messages, recentMessages, rateLimits] = await Promise.all([
        q<{ user_id: string; role: string }>('team_bots', () =>
            db.from('team_bots').select('user_id, role').eq('hidden', false)),
        q<{ status: string; created_at: string }>('permission_requests', () =>
            db.from('permission_requests').select('status, created_at').gte('created_at', weekIso)),
        q<{ id: string; user_id: string; action_type: string; summary: string; status: string; created_at: string }>('permission_requests(recent)', () =>
            db.from('permission_requests').select('id, user_id, action_type, summary, status, created_at')
                .order('created_at', { ascending: false }).limit(20)),
        q<{ day: string; user_id: string }>('checkins', () =>
            db.from('checkins').select('day, user_id').gte('day', todayKstDate(now - 6 * 86400000))),
        q<{ due_on: string | null; done_at: string | null }>('next_steps', () =>
            db.from('next_steps').select('due_on, done_at').is('done_at', null)),
        q<{ channel: string; status: string }>('message_log', () =>
            db.from('message_log').select('channel, status').gte('created_at', weekIso)),
        q<{ id: string; channel: string; status: string; to_hint: string | null; error: string | null; created_at: string }>('message_log(recent)', () =>
            db.from('message_log').select('id, channel, status, to_hint, error, created_at')
                .order('created_at', { ascending: false }).limit(20)),
        q<{ key: string; count: number }>('rate_limits', () =>
            db.from('rate_limits').select('key, count').gte('window_start', hourIso)),
    ])

    // 표 없는 것 목록 (화면에 「표 아직 없음」으로 알린다)
    const missingTables = [
        bots.missing && 'team_bots',
        approvals.missing && 'permission_requests',
        checkins.missing && 'checkins',
        nextSteps.missing && 'next_steps',
        messages.missing && 'message_log',
        rateLimits.missing && 'rate_limits',
    ].filter((t): t is string => typeof t === 'string')

    return NextResponse.json({
        generatedAt: new Date(now).toISOString(),
        window: { todayFrom: todayIso, weekFrom: weekIso, hourFrom: hourIso },
        missingTables,
        team: teamStats(bots.rows),
        approvals: approvalStats(approvals.rows, todayIso),
        checkins: checkinStats(checkins.rows),
        nextSteps: nextStepStats(nextSteps.rows, todayDate),
        messages: messageStats(messages.rows),
        rateLimitTop: rateLimitTop(rateLimits.rows, 5),
        driver: {
            picked: pickDriverFromEnv(false),          // 지금 고르는 드라이버 이름(solar/gemini/none). 열쇠 값 아님
            env: envPresence(process.env, DRIVER_ENV_NAMES),
        },
        recentApprovals: recentApprovals.rows === null ? null : recentApprovals.rows.map(r => ({
            id: r.id,
            user: shortId(r.user_id),
            action: r.action_type,
            summary: truncate(r.summary, 60),
            status: r.status,
            at: r.created_at,
        })),
        recentMessages: recentMessages.rows === null ? null : recentMessages.rows.map(r => ({
            id: r.id,
            channel: r.channel,
            status: r.status,
            toHint: r.to_hint ? `…${r.to_hint.slice(-4)}` : '—',
            error: truncate(r.error, 60) || null,
            at: r.created_at,
        })),
    })
}
