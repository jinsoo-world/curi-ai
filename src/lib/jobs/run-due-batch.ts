// lib/jobs — 예약 작업 공통 장치 (「통째로 멈춤」 전수점검 후속, 2026-10-06).
//
// 하루 한 번 도는 예약 작업(드라이브·노션 가져오기 등)이 한 건 때문에 전체가 멈추던 병을 한 곳에서 막는다.
//   1. 고르기   status <> 'paused' AND next_run_at <= now() ORDER BY next_run_at LIMIT n
//   2. 먼저 차지 claimed_at=now, fail_count=fail_count+1, next_run_at=now+backoff
//               (같은 fail_count 이고 차지가 비었거나 10분 넘었을 때만) = 두 실행이 같은 건을 못 잡는다.
//               돌다가 함수가 통째로 죽어도 이미 「실패 1번 + 다음 시도 시각」이 적혀 있어 같은 건이 무한 반복되지 않는다.
//   3. 남은 시간이 한 건 몫(perItemMs)보다 적으면 새 건을 시작하지 않는다(다음 회차에 앞줄에 선다).
//   4. 건마다 try/catch + 한 건 마감(perItemMs).
//   5. 성공 = fail_count 0 · next_run_at 다음 주기 · claimed_at 비움.
//      실패 = last_error. fail_count 가 maxFails 에 닿으면 paused + 알림 한 번(멈춘 건수만, 고장 목록·건 번호를 넣지 않는다).
//   6. 실행 요약 로그 한 줄. 가장 오래 밀린 줄이 2일 넘으면 「멈춤 의심」 알림.
//
// 알림은 기존 보고 관문(lib/slack sendSlackNotification)을 그대로 쓴다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendSlackNotification } from '@/lib/slack'

export interface DueJob { id: string; failCount: number }

export interface DueJobStore<T extends DueJob> {
    pick(limit: number, now: Date): Promise<T[]>
    /** 잡았으면 true. 잡으면서 fail_count 를 하나 올리고 다음 시도 시각을 retryAt 으로 미룬다 */
    claim(job: T, now: Date, retryAt: Date, staleBefore: Date): Promise<boolean>
    succeed(job: T, nextRunAt: Date): Promise<void>
    fail(job: T, error: string, pause: boolean): Promise<void>
    /** 멈춤 아닌 줄 중 가장 오래된 next_run_at (없으면 null) */
    oldestDue(now: Date): Promise<string | null>
}

export interface RunDueBatchOptions<T extends DueJob> {
    /** 사람이 읽는 작업 이름 (알림·로그) */
    name: string
    store: DueJobStore<T>
    run: (job: T, signal: AbortSignal) => Promise<void>
    /** 성공했을 때 다음에 돌 시각 */
    nextRunAt: (job: T, now: Date) => Date
    /** 이 시각(ms)까지 끝낸다 */
    deadline: number
    /** 한 건 마감(ms). 남은 시간이 이것보다 적으면 새 건을 시작하지 않는다 */
    perItemMs: number
    limit?: number
    maxFails?: number
    /** 실패 뒤 다음 시도까지 (기본 1시간) */
    backoffMs?: number
    /** 이보다 오래된 차지는 죽은 실행으로 본다 (기본 10분) */
    staleMs?: number
    /** 이보다 오래 밀리면 멈춤 의심 (기본 2일) */
    stuckAfterMs?: number
    now?: () => Date
    notify?: (text: string) => Promise<void>
}

export interface DueBatchSummary {
    name: string
    picked: number
    claimed: number
    notClaimed: number
    ok: number
    failed: number
    paused: number
    skippedForTime: number
    oldestOverdueHours: number | null
    ms: number
}

export const JOB_DEFAULTS = {
    maxFails: 3,
    backoffMs: 60 * 60_000,
    staleMs: 10 * 60_000,
    stuckAfterMs: 2 * 86_400_000,
} as const

class ItemTimeout extends Error {
    constructor(ms: number) { super(`한 건 시간 초과(${Math.round(ms / 1000)}초)`) }
}

async function runWithTimeout(fn: (signal: AbortSignal) => Promise<void>, ms: number): Promise<void> {
    const ac = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { ac.abort(); reject(new ItemTimeout(ms)) }, ms)
    })
    try {
        await Promise.race([fn(ac.signal), timeout])
    } finally {
        clearTimeout(timer)
    }
}

const defaultNotify = (text: string) => sendSlackNotification(text, undefined, { timeoutMs: 3_000 })

export async function runDueBatch<T extends DueJob>(o: RunDueBatchOptions<T>): Promise<DueBatchSummary> {
    const started = Date.now()
    const now = o.now ?? (() => new Date())
    const notify = o.notify ?? defaultNotify
    const maxFails = o.maxFails ?? JOB_DEFAULTS.maxFails
    const backoffMs = o.backoffMs ?? JOB_DEFAULTS.backoffMs
    const staleMs = o.staleMs ?? JOB_DEFAULTS.staleMs
    const stuckAfterMs = o.stuckAfterMs ?? JOB_DEFAULTS.stuckAfterMs
    const s: DueBatchSummary = { name: o.name, picked: 0, claimed: 0, notClaimed: 0, ok: 0, failed: 0, paused: 0, skippedForTime: 0, oldestOverdueHours: null, ms: 0 }

    const jobs = await o.store.pick(o.limit ?? 20, now())
    s.picked = jobs.length

    for (const job of jobs) {
        if (o.deadline - Date.now() < o.perItemMs) { s.skippedForTime++; continue }
        const t = now()
        let claimed = false
        try {
            claimed = await o.store.claim(job, t, new Date(t.getTime() + backoffMs), new Date(t.getTime() - staleMs))
        } catch (e) {
            console.error(`[jobs/${o.name}] 차지 실패`, job.id, e instanceof Error ? e.message : e)
        }
        if (!claimed) { s.notClaimed++; continue }
        s.claimed++

        try {
            await runWithTimeout(signal => o.run(job, signal), o.perItemMs)
            s.ok++
            try { await o.store.succeed(job, o.nextRunAt(job, now())) } catch (e) {
                console.error(`[jobs/${o.name}] 성공 기록 실패`, job.id, e instanceof Error ? e.message : e)
            }
        } catch (e) {
            s.failed++
            const message = (e instanceof Error ? e.message : String(e)).slice(0, 300)
            const pause = job.failCount + 1 >= maxFails   // 차지할 때 이미 하나 올렸다
            if (pause) s.paused++
            console.error(`[jobs/${o.name}] 실패`, job.id, `fail_count=${job.failCount + 1}`, message)
            try { await o.store.fail(job, message, pause) } catch (e2) {
                console.error(`[jobs/${o.name}] 실패 기록 실패`, job.id, e2 instanceof Error ? e2.message : e2)
            }
        }
    }

    if (s.paused > 0) {
        await notify(`🛑 [예약 작업 멈춤] ${o.name}: ${maxFails}번 연속 실패한 ${s.paused}건을 멈췄어요. 고친 뒤 다시 켜 주세요.`).catch(() => {})
    }

    try {
        const oldest = await o.store.oldestDue(now())
        if (oldest) {
            const lagMs = now().getTime() - new Date(oldest).getTime()
            if (Number.isFinite(lagMs) && lagMs > 0) s.oldestOverdueHours = Math.round(lagMs / 3_600_000)
            if (lagMs > stuckAfterMs) {
                await notify(`⚠️ [멈춤 의심] ${o.name}: 2일 넘게 밀린 예약 작업이 있어요. 예약 작업이 돌고 있는지 확인해 주세요.`).catch(() => {})
            }
        }
    } catch (e) {
        console.error(`[jobs/${o.name}] 밀림 확인 실패`, e instanceof Error ? e.message : e)
    }

    s.ms = Date.now() - started
    console.log(`[jobs/${o.name}]`, JSON.stringify(s))
    return s
}

/* ────────────────────────── Supabase 표 하나에 붙이는 저장소 ────────────────────────── */

export interface TableJobConfig<T extends DueJob> {
    table: string
    /** 고를 때 읽을 칸 (id, fail_count 포함) */
    select: string
    map: (row: Record<string, unknown>) => T
}

export function createTableJobStore<T extends DueJob>(db: SupabaseClient, cfg: TableJobConfig<T>): DueJobStore<T> {
    return {
        async pick(limit, now) {
            const { data, error } = await db.from(cfg.table).select(cfg.select)
                .neq('status', 'paused').lte('next_run_at', now.toISOString())
                .order('next_run_at', { ascending: true }).limit(limit)
            if (error) throw Object.assign(new Error(error.message), { code: error.code })
            return ((data ?? []) as unknown as Record<string, unknown>[]).map(cfg.map)
        },
        async claim(job, now, retryAt, staleBefore) {
            const { data, error } = await db.from(cfg.table)
                .update({ claimed_at: now.toISOString(), fail_count: job.failCount + 1, next_run_at: retryAt.toISOString() })
                .eq('id', job.id).eq('fail_count', job.failCount)
                .or(`claimed_at.is.null,claimed_at.lt."${staleBefore.toISOString()}"`)
                .select('id')
            if (error) throw new Error(error.message)
            return (data ?? []).length > 0
        },
        async succeed(job, nextRunAt) {
            const { error } = await db.from(cfg.table)
                .update({ fail_count: 0, claimed_at: null, next_run_at: nextRunAt.toISOString() })
                .eq('id', job.id)
            if (error) throw new Error(error.message)
        },
        async fail(job, message, pause) {
            const patch: Record<string, unknown> = { claimed_at: null, last_error: message.slice(0, 300) }
            if (pause) patch.status = 'paused'
            const { error } = await db.from(cfg.table).update(patch).eq('id', job.id)
            if (error) throw new Error(error.message)
        },
        async oldestDue(now) {
            const { data, error } = await db.from(cfg.table).select('next_run_at')
                .neq('status', 'paused').lte('next_run_at', now.toISOString())
                .order('next_run_at', { ascending: true }).limit(1)
            if (error) throw new Error(error.message)
            const row = ((data ?? []) as unknown as { next_run_at: string | null }[])[0]
            return row?.next_run_at ?? null
        },
    }
}
