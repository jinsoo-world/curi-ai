// domains/os — 루틴 읽기, 쓰기, 한 번 돌리기 (서버에서만 부른다).
//
// db 는 service_role 이라 RLS 를 우회한다. 그래서 여기 모든 질의에 user_id 를 반드시 건다.
// 시간 규칙은 전부 schedule.ts(순수)에 있고 여기는 DB 와 모델만 만진다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { solarChatStream } from '@/domains/llm'
import { buildRoutinePrompt, shouldRunNow, alreadyRanInSlot } from './schedule'
import type { OnMissingData, ScheduleKind } from './schedule'

/** 표가 아직 DB 에 없을 때(마이그레이션 미적용) 나는 Postgres 오류 번호 */
const TABLE_MISSING = '42P01'
const TABLE_MISSING_REST = 'PGRST205'   // PostgREST 는 표가 없으면 이 코드를 준다

export class RoutineTableMissing extends Error {
    constructor() { super('bot_routines 표가 아직 없다. supabase/migrations/20260926_bot_routines.sql 을 실행해야 한다') }
}

export interface BotRoutine {
    id: string
    userId: string
    mentorId: string
    title: string
    instruction: string
    scheduleKind: ScheduleKind
    runAtLocal: string
    weekday: number | null
    timezone: string
    inputSource: string | null
    expectedOutput: string
    onMissingData: OnMissingData
    approvalBoundary: string
    enabled: boolean
    lastRunAt: string | null
    lastResult: string | null
    createdAt: string
}

export interface NewRoutineInput {
    mentorId: string
    title: string
    instruction: string
    scheduleKind: ScheduleKind
    runAtLocal: string
    weekday: number | null
    inputSource?: string | null
    expectedOutput?: string
    onMissingData?: OnMissingData
    approvalBoundary?: string
}

type Row = {
    id: string; user_id: string; mentor_id: string; title: string; instruction: string
    schedule_kind: ScheduleKind; run_at_local: string; weekday: number | null; timezone: string
    input_source: string | null; expected_output: string; on_missing_data: OnMissingData
    approval_boundary: string; enabled: boolean; last_run_at: string | null; last_result: string | null
    created_at: string
}

const COLS = 'id, user_id, mentor_id, title, instruction, schedule_kind, run_at_local, weekday, timezone, input_source, expected_output, on_missing_data, approval_boundary, enabled, last_run_at, last_result, created_at'

function toRoutine(r: Row): BotRoutine {
    return {
        id: r.id, userId: r.user_id, mentorId: r.mentor_id, title: r.title, instruction: r.instruction,
        scheduleKind: r.schedule_kind, runAtLocal: r.run_at_local, weekday: r.weekday, timezone: r.timezone,
        inputSource: r.input_source, expectedOutput: r.expected_output, onMissingData: r.on_missing_data,
        approvalBoundary: r.approval_boundary, enabled: r.enabled, lastRunAt: r.last_run_at,
        lastResult: r.last_result, createdAt: r.created_at,
    }
}

function rethrow(error: { code?: string; message?: string }): never {
    if ((error.code === TABLE_MISSING || error.code === TABLE_MISSING_REST)) throw new RoutineTableMissing()
    throw new Error(error.message ?? '루틴 표를 읽지 못했다')
}

/** 내 루틴 목록. mentorId 를 주면 그 봇 것만 */
export async function listRoutines(db: SupabaseClient, userId: string, mentorId?: string): Promise<BotRoutine[]> {
    let q = db.from('bot_routines').select(COLS).eq('user_id', userId)
    if (mentorId) q = q.eq('mentor_id', mentorId)
    const { data, error } = await q.order('run_at_local', { ascending: true }).order('created_at', { ascending: true })
    if (error) rethrow(error)
    return ((data ?? []) as unknown as Row[]).map(toRoutine)
}

/** 루틴 하나 (주인 확인 포함) */
export async function getRoutine(db: SupabaseClient, userId: string, id: string): Promise<BotRoutine | null> {
    const { data, error } = await db.from('bot_routines').select(COLS).eq('user_id', userId).eq('id', id).maybeSingle()
    if (error) rethrow(error)
    return data ? toRoutine(data as unknown as Row) : null
}

/** 새 루틴. 항상 꺼진 채로 태어난다 — 사람이 「시험 실행」을 보고 켠다 */
export async function createRoutine(db: SupabaseClient, userId: string, input: NewRoutineInput): Promise<BotRoutine> {
    // 남의 봇에 루틴을 달 수 없다
    const { data: owned } = await db.from('team_bots').select('id').eq('user_id', userId).eq('mentor_id', input.mentorId).maybeSingle()
    if (!owned) throw new Error('내 팀에 없는 봇이에요')

    const { data, error } = await db.from('bot_routines').insert({
        user_id: userId,
        mentor_id: input.mentorId,
        title: input.title,
        instruction: input.instruction,
        schedule_kind: input.scheduleKind,
        run_at_local: input.runAtLocal,
        weekday: input.scheduleKind === 'weekly' ? input.weekday : null,
        timezone: 'Asia/Seoul',
        input_source: (input.inputSource ?? '').trim() || null,
        expected_output: (input.expectedOutput ?? '').trim(),
        on_missing_data: input.onMissingData ?? 'report_failure',
        approval_boundary: (input.approvalBoundary ?? '').trim() || '밖으로 보내는 일은 항상 승인받는다',
        enabled: false,
    }).select(COLS).single()
    if (error) rethrow(error)
    return toRoutine(data as unknown as Row)
}

/** 켜기, 끄기와 칸 고치기 */
export async function updateRoutine(
    db: SupabaseClient, userId: string, id: string,
    patch: Partial<Pick<BotRoutine, 'enabled' | 'title' | 'instruction' | 'scheduleKind' | 'runAtLocal' | 'weekday' | 'inputSource' | 'expectedOutput' | 'onMissingData' | 'approvalBoundary'>>,
): Promise<void> {
    const row: Record<string, unknown> = {}
    if (patch.enabled !== undefined) row.enabled = patch.enabled
    if (patch.title !== undefined) row.title = patch.title
    if (patch.instruction !== undefined) row.instruction = patch.instruction
    if (patch.scheduleKind !== undefined) row.schedule_kind = patch.scheduleKind
    if (patch.runAtLocal !== undefined) row.run_at_local = patch.runAtLocal
    if (patch.weekday !== undefined) row.weekday = patch.weekday
    if (patch.inputSource !== undefined) row.input_source = patch.inputSource
    if (patch.expectedOutput !== undefined) row.expected_output = patch.expectedOutput
    if (patch.onMissingData !== undefined) row.on_missing_data = patch.onMissingData
    if (patch.approvalBoundary !== undefined) row.approval_boundary = patch.approvalBoundary
    if (Object.keys(row).length === 0) return
    const { error } = await db.from('bot_routines').update(row).eq('id', id).eq('user_id', userId)
    if (error) rethrow(error)
}

export async function deleteRoutine(db: SupabaseClient, userId: string, id: string): Promise<void> {
    const { error } = await db.from('bot_routines').delete().eq('id', id).eq('user_id', userId)
    if (error) rethrow(error)
}

/** 크론용: 켜진 루틴 전부 (판정은 shouldRunNow 가 한다) */
export async function listEnabledRoutines(db: SupabaseClient, limit = 500): Promise<BotRoutine[]> {
    const { data, error } = await db.from('bot_routines').select(COLS).eq('enabled', true).limit(limit)
    if (error) rethrow(error)
    return ((data ?? []) as unknown as Row[]).map(toRoutine)
}

/** 지금 돌 것만 고른다 (순수 규칙 두 개를 이어 붙인 것) */
export function pickDue(routines: BotRoutine[], now: Date): BotRoutine[] {
    return routines.filter(r =>
        shouldRunNow({ schedule_kind: r.scheduleKind, run_at_local: r.runAtLocal, weekday: r.weekday, timezone: r.timezone }, now)
        && !alreadyRanInSlot(r.lastRunAt, now, r.runAtLocal, r.timezone),
    )
}

/** 봇이 답할 자리(세션)를 찾고, 없으면 만든다 */
async function ensureSession(db: SupabaseClient, userId: string, mentorId: string, botName: string): Promise<string | null> {
    const { data: last } = await db
        .from('chat_sessions')
        .select('id')
        .eq('user_id', userId)
        .eq('mentor_id', mentorId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    if (last?.id) return last.id as string

    const { data: made } = await db
        .from('chat_sessions')
        .insert({ user_id: userId, mentor_id: mentorId, title: `${botName}와의 대화`, message_count: 0 })
        .select('id')
        .single()
    return (made?.id as string) ?? null
}

/** 모델이 낸 글자를 다 모은다 (루틴은 흘려 보여줄 화면이 없다) */
async function askBot(systemPrompt: string, userText: string): Promise<string> {
    let full = ''
    for await (const chunk of solarChatStream(systemPrompt, [{ role: 'user', content: userText }])) {
        if (chunk.text) full += chunk.text
    }
    return full.trim()
}

export interface RunResult {
    ok: boolean
    /** 「성공: …」 또는 「실패: …」 한 줄 (목록에 그대로 보인다) */
    result: string
    /** 봇이 만든 글 (시험 실행 때 화면에 바로 보여준다) */
    text: string
}

/**
 * 루틴 한 번 돌리기. 크론과 「시험 실행」이 같은 길을 쓴다 —
 * 시험에서 본 것과 아침에 도는 것이 다르면 사람이 속는다(안티패턴 ⑬).
 *
 * 실패해도 던지지 않는다. 실패는 last_result 에 「실패: …」로 남고 다음 루틴이 계속 돈다.
 */
export async function runRoutineOnce(db: SupabaseClient, routine: BotRoutine): Promise<RunResult> {
    const 시작 = Date.now()
    let 결과: RunResult
    try {
        const { data: mentor } = await db
            .from('mentors')
            .select('name, system_prompt')
            .eq('id', routine.mentorId)
            .single()
        if (!mentor) throw new Error('봇을 찾지 못했어요')

        const text = await askBot(
            (mentor.system_prompt as string) || '',
            buildRoutinePrompt({
                title: routine.title,
                instruction: routine.instruction,
                input_source: routine.inputSource,
                expected_output: routine.expectedOutput,
                on_missing_data: routine.onMissingData,
                approval_boundary: routine.approvalBoundary,
            }),
        )
        if (!text) throw new Error('모델이 아무 말도 하지 않았어요')

        const sessionId = await ensureSession(db, routine.userId, routine.mentorId, (mentor.name as string) || '봇')
        if (sessionId) {
            await db.from('messages').insert({ session_id: sessionId, role: 'assistant', content: text })
            await db.from('chat_sessions').update({ last_message_at: new Date().toISOString() }).eq('id', sessionId)
        }
        결과 = { ok: true, result: `성공: ${text.slice(0, 60).replace(/\s+/g, ' ')}…`, text }
    } catch (e) {
        const 이유 = e instanceof Error ? e.message : String(e)
        console.error('[os/routine run]', routine.id, 이유)
        결과 = { ok: false, result: `실패: ${이유.slice(0, 120)}`, text: '' }
    }

    // 성공이든 실패든 「돌았다」는 사실은 남긴다. 안 남기면 5분 뒤 또 돈다.
    try {
        await db.from('bot_routines')
            .update({ last_run_at: new Date().toISOString(), last_result: 결과.result })
            .eq('id', routine.id)
    } catch { /* 기록 실패가 다음 루틴을 막지 않는다 */ }

    console.log(`[os/routine] id=${routine.id} ok=${결과.ok} ms=${Date.now() - 시작}`)
    return 결과
}
