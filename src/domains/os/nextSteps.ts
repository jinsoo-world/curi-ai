// domains/os — 「다음 한 걸음」(미룬 일) 읽기, 쓰기. 서버에서만 부른다(user_id 를 여기서 건다).
//
// 봇이 답 끝에 낸 제안을 사람이 한 번 눌러 저장하는 자리다.
// 표(next_steps)는 20260923_agent_os_p0.sql 에 있다. 아직 없으면 「준비 중」으로 조용히 비운다.

import type { SupabaseClient } from '@supabase/supabase-js'

const TABLE_MISSING = '42P01'

export class NextStepTableMissing extends Error {
    constructor() { super('next_steps 표가 아직 없다. supabase/migrations/20260923_agent_os_p0.sql 을 실행해야 한다') }
}

export interface NextStep {
    id: string
    mentorId: string | null
    text: string
    dueOn: string | null
    doneAt: string | null
    createdAt: string
}

type Row = { id: string; mentor_id: string | null; text: string; due_on: string | null; done_at: string | null; created_at: string }
const COLS = 'id, mentor_id, text, due_on, done_at, created_at'

function toStep(r: Row): NextStep {
    return { id: r.id, mentorId: r.mentor_id, text: r.text, dueOn: r.due_on, doneAt: r.done_at, createdAt: r.created_at }
}

function rethrow(error: { code?: string; message?: string }): never {
    if (error.code === TABLE_MISSING) throw new NextStepTableMissing()
    throw new Error(error.message ?? '미룬 일을 읽지 못했다')
}

/** 안 끝낸 것부터. openOnly=false 면 끝낸 것도 (최근 것 위주) */
export async function listNextSteps(db: SupabaseClient, userId: string, openOnly = true, limit = 50): Promise<NextStep[]> {
    let q = db.from('next_steps').select(COLS).eq('user_id', userId)
    if (openOnly) q = q.is('done_at', null)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
    if (error) rethrow(error)
    return ((data ?? []) as unknown as Row[]).map(toStep)
}

export async function createNextStep(
    db: SupabaseClient, userId: string,
    input: { text: string; mentorId?: string | null; dueOn?: string | null },
): Promise<NextStep> {
    const { data, error } = await db.from('next_steps').insert({
        user_id: userId,
        mentor_id: input.mentorId ?? null,
        text: input.text,
        due_on: input.dueOn ?? null,
    }).select(COLS).single()
    if (error) rethrow(error)
    return toStep(data as unknown as Row)
}

/** 끝냈다/다시 열었다, 기한, 글 고치기 */
export async function patchNextStep(
    db: SupabaseClient, userId: string, id: string,
    patch: { done?: boolean; text?: string; dueOn?: string | null },
): Promise<void> {
    const row: Record<string, unknown> = {}
    if (patch.done !== undefined) row.done_at = patch.done ? new Date().toISOString() : null
    if (patch.text !== undefined) row.text = patch.text
    if (patch.dueOn !== undefined) row.due_on = patch.dueOn
    if (Object.keys(row).length === 0) return
    const { error } = await db.from('next_steps').update(row).eq('id', id).eq('user_id', userId)
    if (error) rethrow(error)
}

/**
 * 봇 답의 마지막 문장 = 「다음 한 걸음」 기본값.
 * 사람이 고쳐서 저장하니 완벽할 필요는 없다. 다만 표, 목록 기호는 떼고 한 문장만 남긴다.
 */
export function guessNextStep(answer: string): string {
    const 줄들 = (answer ?? '')
        .split('\n')
        .map(l => l.replace(/^[\s>*\-–—•\d.)]+/, '').trim())
        .filter(l => l.length > 1 && !l.startsWith('|') && !/^#/.test(l))
    const 마지막 = 줄들[줄들.length - 1] ?? ''
    const 문장 = 마지막.split(/(?<=[.?!。])\s+/).filter(Boolean)
    return (문장[문장.length - 1] ?? 마지막).trim().slice(0, 120)
}
