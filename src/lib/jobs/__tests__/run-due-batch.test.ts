import { describe, it, expect, vi } from 'vitest'
import { runDueBatch, createTableJobStore, type DueJob, type DueJobStore } from '../run-due-batch'

const NOW = new Date('2026-10-06T00:00:00Z')

type Job = DueJob & { name: string }

function fakeStore(jobs: Job[], opts: { claimFails?: string[]; oldest?: string | null } = {}) {
    const calls = { claim: [] as string[], ok: [] as string[], fail: [] as { id: string; error: string; pause: boolean }[] }
    const store: DueJobStore<Job> = {
        async pick(limit) { return jobs.slice(0, limit) },
        async claim(job) {
            calls.claim.push(job.id)
            return !(opts.claimFails ?? []).includes(job.id)
        },
        async succeed(job) { calls.ok.push(job.id) },
        async fail(job, error, pause) { calls.fail.push({ id: job.id, error, pause }) },
        async oldestDue() { return opts.oldest ?? null },
    }
    return { store, calls }
}

const job = (id: string, failCount = 0): Job => ({ id, failCount, name: id })

describe('공통 예약 작업 장치 runDueBatch', () => {
    it('성공한 건은 succeed, 실패한 건은 fail(멈춤 아님)', async () => {
        const { store, calls } = fakeStore([job('a'), job('b')])
        const r = await runDueBatch({
            name: 't', store, now: () => NOW, deadline: Date.now() + 60_000, perItemMs: 1_000, notify: vi.fn(),
            run: async j => { if (j.id === 'b') throw new Error('고장') },
            nextRunAt: () => new Date(NOW.getTime() + 3600_000),
        })
        expect(calls.ok).toEqual(['a'])
        expect(calls.fail).toEqual([{ id: 'b', error: '고장', pause: false }])
        expect(r).toMatchObject({ picked: 2, claimed: 2, ok: 1, failed: 1, paused: 0 })
    })

    it('먼저 차지 못 한 건(다른 실행이 잡음)은 돌리지 않는다', async () => {
        const { store, calls } = fakeStore([job('a'), job('b')], { claimFails: ['a'] })
        const run = vi.fn(async () => {})
        const r = await runDueBatch({ name: 't', store, run, now: () => NOW, deadline: Date.now() + 60_000, perItemMs: 1_000, notify: vi.fn(), nextRunAt: () => NOW })
        expect(run).toHaveBeenCalledTimes(1)
        expect(calls.ok).toEqual(['b'])
        expect(r.notClaimed).toBe(1)
    })

    it('실패가 maxFails 에 닿으면 멈춤(paused) + 알림 1회, 알림에 고장 목록을 넣지 않는다', async () => {
        const { store, calls } = fakeStore([job('a', 2), job('b', 2)])
        const notify = vi.fn(async () => {})
        const r = await runDueBatch({
            name: '드라이브', store, now: () => NOW, deadline: Date.now() + 60_000, perItemMs: 1_000, maxFails: 3, notify,
            run: async () => { throw new Error('secret-token-xyz 실패') },
            nextRunAt: () => NOW,
        })
        expect(calls.fail.every(f => f.pause)).toBe(true)
        expect(r.paused).toBe(2)
        expect(notify).toHaveBeenCalledTimes(1)
        const text = String((notify.mock.calls[0] as unknown[])[0])
        expect(text).toContain('드라이브')
        expect(text).toContain('2')
        expect(text).not.toContain('secret-token-xyz')
        expect(text).not.toContain('a')   // 건 번호를 늘어놓지 않는다
    })

    it('남은 시간이 한 건 몫보다 적으면 새 건을 시작하지 않는다', async () => {
        const { store } = fakeStore([job('a'), job('b')])
        const run = vi.fn(async () => {})
        const r = await runDueBatch({ name: 't', store, run, now: () => NOW, deadline: Date.now() + 500, perItemMs: 1_000, notify: vi.fn(), nextRunAt: () => NOW })
        expect(run).not.toHaveBeenCalled()
        expect(r.skippedForTime).toBe(2)
    })

    it('한 건이 perItemMs 를 넘기면 끊고 실패로 센다(멈추지 않는다)', async () => {
        const { store, calls } = fakeStore([job('a'), job('b')])
        let aborted = false
        const r = await runDueBatch({
            name: 't', store, now: () => NOW, deadline: Date.now() + 60_000, perItemMs: 30, notify: vi.fn(),
            run: async (j, signal) => {
                if (j.id === 'a') {
                    signal.addEventListener('abort', () => { aborted = true })
                    await new Promise(r => setTimeout(r, 200))
                }
            },
            nextRunAt: () => NOW,
        })
        expect(aborted).toBe(true)
        expect(calls.fail[0].id).toBe('a')
        expect(calls.fail[0].error).toMatch(/시간/)
        expect(calls.ok).toEqual(['b'])
        expect(r).toMatchObject({ ok: 1, failed: 1 })
    })

    it('가장 오래 밀린 줄이 2일 넘으면 멈춤 의심 알림', async () => {
        const old = new Date(NOW.getTime() - 3 * 86_400_000).toISOString()
        const { store } = fakeStore([], { oldest: old })
        const notify = vi.fn(async () => {})
        const r = await runDueBatch({ name: '루틴', store, run: async () => {}, now: () => NOW, deadline: Date.now() + 60_000, perItemMs: 1_000, notify, nextRunAt: () => NOW })
        expect(r.oldestOverdueHours).toBe(72)
        expect(notify).toHaveBeenCalledTimes(1)
        expect(String((notify.mock.calls[0] as unknown[])[0])).toContain('멈춤 의심')
    })

    it('1일 밀린 건 알리지 않는다', async () => {
        const { store } = fakeStore([], { oldest: new Date(NOW.getTime() - 86_400_000).toISOString() })
        const notify = vi.fn(async () => {})
        await runDueBatch({ name: 't', store, run: async () => {}, now: () => NOW, deadline: Date.now() + 60_000, perItemMs: 1_000, notify, nextRunAt: () => NOW })
        expect(notify).not.toHaveBeenCalled()
    })

    it('succeed 기록이 실패해도 다음 건은 계속 돈다', async () => {
        const { store, calls } = fakeStore([job('a'), job('b')])
        store.succeed = vi.fn(async (j: Job) => { if (j.id === 'a') throw new Error('db down'); calls.ok.push(j.id) })
        const r = await runDueBatch({ name: 't', store, run: async () => {}, now: () => NOW, deadline: Date.now() + 60_000, perItemMs: 1_000, notify: vi.fn(), nextRunAt: () => NOW })
        expect(calls.ok).toEqual(['b'])
        expect(r.ok).toBe(2)
    })
})

describe('createTableJobStore (Supabase 모양)', () => {
    function fakeDb(result: { data: unknown; error: unknown }) {
        const ops: { method: string; args: unknown[] }[] = []
        const q: Record<string, unknown> = {}
        for (const m of ['select', 'update', 'eq', 'neq', 'lte', 'lt', 'or', 'order', 'limit', 'is']) {
            q[m] = (...args: unknown[]) => { ops.push({ method: m, args }); return q }
        }
        q.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
        const db = { from: (t: string) => { ops.push({ method: 'from', args: [t] }); return q } }
        return { db, ops }
    }

    it('차지는 fail_count 를 하나 올리고, 같은 fail_count + 비었거나 10분 넘은 차지일 때만 잡는다', async () => {
        const { db, ops } = fakeDb({ data: [{ id: 'x' }], error: null })
        const store = createTableJobStore(db as never, { table: 'knowledge_syncs', select: 'id', map: r => ({ id: String(r.id), failCount: 0 }) })
        const ok = await store.claim({ id: 'x', failCount: 1 }, NOW, new Date(NOW.getTime() + 3600_000), new Date(NOW.getTime() - 600_000))
        expect(ok).toBe(true)
        const upd = ops.find(o => o.method === 'update')!.args[0] as Record<string, unknown>
        expect(upd.fail_count).toBe(2)
        expect(upd.claimed_at).toBe(NOW.toISOString())
        expect(upd.next_run_at).toBe(new Date(NOW.getTime() + 3600_000).toISOString())
        expect(ops.filter(o => o.method === 'eq').map(o => o.args)).toEqual([['id', 'x'], ['fail_count', 1]])
        expect(String(ops.find(o => o.method === 'or')!.args[0])).toContain('claimed_at.is.null')
    })

    it('차지 결과가 0줄이면 false', async () => {
        const { db } = fakeDb({ data: [], error: null })
        const store = createTableJobStore(db as never, { table: 't', select: 'id', map: r => ({ id: String(r.id), failCount: 0 }) })
        expect(await store.claim({ id: 'x', failCount: 0 }, NOW, NOW, NOW)).toBe(false)
    })

    it('고르기는 멈춤 아닌 것, 시각이 된 것, 오래된 순', async () => {
        const { db, ops } = fakeDb({ data: [{ id: 'a', fail_count: 1 }], error: null })
        const store = createTableJobStore(db as never, { table: 't', select: 'id, fail_count', map: r => ({ id: String(r.id), failCount: Number(r.fail_count) }) })
        const rows = await store.pick(5, NOW)
        expect(rows).toEqual([{ id: 'a', failCount: 1 }])
        expect(ops).toEqual(expect.arrayContaining([
            { method: 'neq', args: ['status', 'paused'] },
            { method: 'lte', args: ['next_run_at', NOW.toISOString()] },
            { method: 'order', args: ['next_run_at', { ascending: true }] },
            { method: 'limit', args: [5] },
        ]))
    })
})
