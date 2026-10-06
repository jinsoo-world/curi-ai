// 루틴 예약 실행: 먼저 차지 · AI 마감 · id 순 쪽 나눠 읽기
import { describe, it, expect } from 'vitest'
import { claimRoutineSlot, listEnabledRoutines, routineAiTimeoutMs } from '../routines'

function fakeDb(pages: unknown[][] | { data: unknown[] }) {
    const ops: { m: string; a: unknown[] }[] = []
    let call = 0
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'update', 'eq', 'is', 'order', 'range']) q[m] = (...a: unknown[]) => { ops.push({ m, a }); return q }
    q.then = (res: (v: unknown) => unknown) => {
        const data = Array.isArray(pages) ? (pages[call++] ?? []) : pages.data
        return Promise.resolve({ data, error: null }).then(res)
    }
    return { db: { from: () => q } as never, ops }
}

const row = (id: string) => ({ id, user_id: 'u', mentor_id: 'm', title: 't', instruction: 'i', schedule_kind: 'daily', run_at_local: '08:30', weekday: null, timezone: 'Asia/Seoul', input_source: null, expected_output: '', on_missing_data: 'report_failure', approval_boundary: '', enabled: true, last_run_at: null, last_result: null, created_at: '' })

describe('루틴 먼저 차지 claimRoutineSlot', () => {
    const now = new Date('2026-10-05T23:31:00Z')
    it('읽었던 last_run_at 그대로일 때만 지금 시각으로 바꾼다', async () => {
        const { db, ops } = fakeDb({ data: [{ id: 'r1' }] })
        expect(await claimRoutineSlot(db, { id: 'r1', lastRunAt: '2026-10-04T23:30:00+00:00' }, now)).toBe(true)
        expect(ops.find(o => o.m === 'update')!.a[0]).toEqual({ last_run_at: now.toISOString() })
        expect(ops.filter(o => o.m === 'eq').map(o => o.a)).toEqual([['id', 'r1'], ['last_run_at', '2026-10-04T23:30:00+00:00']])
    })
    it('한 번도 안 돈 루틴은 last_run_at IS NULL 조건', async () => {
        const { db, ops } = fakeDb({ data: [{ id: 'r1' }] })
        await claimRoutineSlot(db, { id: 'r1', lastRunAt: null }, now)
        expect(ops.find(o => o.m === 'is')!.a).toEqual(['last_run_at', null])
    })
    it('그사이 다른 실행이 돌았으면(0줄) false', async () => {
        const { db } = fakeDb({ data: [] })
        expect(await claimRoutineSlot(db, { id: 'r1', lastRunAt: null }, now)).toBe(false)
    })
})

describe('켜진 루틴 읽기 listEnabledRoutines', () => {
    it('id 순으로 쪽마다 끝까지 읽는다(앞 500개에서 잘리지 않는다)', async () => {
        const { db, ops } = fakeDb([[row('a'), row('b')], [row('c')]])
        const all = await listEnabledRoutines(db, 2)
        expect(all.map(r => r.id)).toEqual(['a', 'b', 'c'])
        expect(ops.filter(o => o.m === 'order')[0].a).toEqual(['id', { ascending: true }])
        expect(ops.filter(o => o.m === 'range').map(o => o.a)).toEqual([[0, 1], [2, 3]])
    })
})

describe('AI 호출 마감 routineAiTimeoutMs', () => {
    it('min(남은 시간 - 3초, 25초)', () => {
        expect(routineAiTimeoutMs(50_000)).toBe(25_000)
        expect(routineAiTimeoutMs(20_000)).toBe(17_000)
    })
    it('남은 시간이 모자라면 0 = 새 루틴을 시작하지 않는다', () => {
        expect(routineAiTimeoutMs(7_000)).toBe(0)
        expect(routineAiTimeoutMs(-1)).toBe(0)
    })
})
