// domains/agent — 승인 카드 읽고 쓰기 (permission_requests 표)
//
// 규칙 셋만 지킨다.
//  1) 서버는 service_role(RLS 우회)로 DB 를 만지므로 **모든 질의에 user_id 를 건다**.
//  2) 카드는 지우지 않는다. 감사로그다. (거절도 기록으로 남는다)
//  3) 「허용」이 되어도 여기서 실제로 보내지 않는다. 보내는 일은 발신 담당이 나중에 한다.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { IrreversibleAction } from './tool-gate'

/** 표가 아직 없을 때 나는 Postgres 오류 번호 */
const TABLE_MISSING = '42P01'

export class PermissionTableMissing extends Error {
    constructor() { super('permission_requests 표가 아직 없다. supabase/migrations/20260923_agent_os_p0.sql 을 실행해야 한다') }
}

export type PermissionStatus = 'pending' | 'allowed' | 'denied' | 'edited_allowed' | 'expired'

/** 사람이 카드에 내릴 수 있는 답 3가지 */
export const DECISIONS: readonly PermissionStatus[] = ['allowed', 'denied', 'edited_allowed'] as const

export interface PermissionCardRow {
    id: string
    mentorId: string | null
    sessionId: string | null
    actionType: IrreversibleAction
    summary: string
    payload: Record<string, unknown>
    status: PermissionStatus
    decidedAt: string | null
    decidedPayload: Record<string, unknown> | null
    createdAt: string
}

type Raw = {
    id: string; mentor_id: string | null; session_id: string | null
    action_type: IrreversibleAction; summary: string; payload: Record<string, unknown> | null
    status: PermissionStatus; decided_at: string | null
    decided_payload: Record<string, unknown> | null; created_at: string
}

function toCard(r: Raw): PermissionCardRow {
    return {
        id: r.id, mentorId: r.mentor_id, sessionId: r.session_id,
        actionType: r.action_type, summary: r.summary, payload: r.payload ?? {},
        status: r.status, decidedAt: r.decided_at, decidedPayload: r.decided_payload,
        createdAt: r.created_at,
    }
}

const SELECT = 'id, mentor_id, session_id, action_type, summary, payload, status, decided_at, decided_payload, created_at'

export interface NewCard {
    mentorId?: string | null
    sessionId?: string | null
    actionType: IrreversibleAction
    summary: string
    payload?: Record<string, unknown>
}

/** 카드 만들기 (항상 pending 으로 시작한다. 만든 즉시 허용된 카드는 없다) */
export async function createPermissionRequest(
    db: SupabaseClient, userId: string, card: NewCard,
): Promise<PermissionCardRow> {
    const { data, error } = await db
        .from('permission_requests')
        .insert({
            user_id: userId,
            mentor_id: card.mentorId ?? null,
            session_id: card.sessionId ?? null,
            action_type: card.actionType,
            summary: card.summary.slice(0, 200),
            payload: card.payload ?? {},
            status: 'pending',
        })
        .select(SELECT)
        .single()
    if (error || !data) {
        if (error?.code === TABLE_MISSING) throw new PermissionTableMissing()
        throw new Error(error?.message ?? '승인 카드를 만들지 못했다')
    }
    return toCard(data as Raw)
}

/** 내 카드 목록 (기본 = 아직 답 안 한 것) */
export async function listPermissionRequests(
    db: SupabaseClient, userId: string, status: PermissionStatus | 'all' = 'pending', limit = 50,
): Promise<PermissionCardRow[]> {
    let q = db.from('permission_requests').select(SELECT).eq('user_id', userId)
    if (status !== 'all') q = q.eq('status', status)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
    if (error) {
        if (error.code === TABLE_MISSING) throw new PermissionTableMissing()
        throw new Error(error.message)
    }
    return ((data ?? []) as Raw[]).map(toCard)
}

/**
 * 카드에 답한다. **아직 답하지 않은(pending) 내 카드**만 바뀐다.
 * 이미 답한 카드를 다시 바꾸려 하면 null 을 돌려준다(두 번 누르기·뒤늦은 창 방지).
 */
export async function decidePermissionRequest(
    db: SupabaseClient, userId: string, id: string,
    decision: PermissionStatus, decidedPayload?: Record<string, unknown> | null,
): Promise<PermissionCardRow | null> {
    if (!DECISIONS.includes(decision)) throw new Error('허용·거절·고쳐서 허용 중 하나여야 한다')
    if (decision === 'edited_allowed' && (!decidedPayload || Object.keys(decidedPayload).length === 0)) {
        throw new Error('고쳐서 허용하려면 고친 내용이 있어야 한다')
    }
    const { data, error } = await db
        .from('permission_requests')
        .update({
            status: decision,
            decided_at: new Date().toISOString(),
            decided_payload: decidedPayload ?? null,
        })
        .eq('id', id)
        .eq('user_id', userId)        // 🔒 남의 카드는 못 만진다
        .eq('status', 'pending')      // 이미 답한 카드는 그대로 둔다
        .select(SELECT)
        .maybeSingle()
    if (error) {
        if (error.code === TABLE_MISSING) throw new PermissionTableMissing()
        throw new Error(error.message)
    }
    return data ? toCard(data as Raw) : null
}
