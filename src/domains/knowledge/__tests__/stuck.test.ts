import { describe, it, expect } from 'vitest'
import { failStuckSources, STUCK_AFTER_MS } from '../stuck'

function fakeDb(results: { data: unknown[] | null; error: { code?: string; message: string } | null }[]) {
    const ops: { m: string; a: unknown[] }[][] = []
    let i = -1
    const db = {
        from: () => {
            ops.push([]); i++
            const mine = ops[i]
            const idx = i
            const q: Record<string, unknown> = {}
            for (const m of ['update', 'in', 'lt', 'or', 'select']) q[m] = (...a: unknown[]) => { mine.push({ m, a }); return q }
            q.then = (res: (v: unknown) => unknown) => Promise.resolve(results[idx]).then(res)
            return q
        },
    }
    return { db: db as never, ops }
}

describe('읽는 중으로 남은 자료 정리 failStuckSources', () => {
    const now = new Date('2026-10-06T00:00:00Z')
    const cut = new Date(now.getTime() - STUCK_AFTER_MS).toISOString()

    it('30분 넘은 pending/processing 을 failed(timeout)로 바꾼다 — 지우지 않는다', async () => {
        const { db, ops } = fakeDb([{ data: [{ id: 'a' }, { id: 'b' }], error: null }])
        expect(await failStuckSources(db, now)).toBe(2)
        const o = ops[0]
        expect(o.find(x => x.m === 'update')!.a[0]).toEqual({ processing_status: 'failed', failure_reason: 'timeout' })
        expect(o.find(x => x.m === 'in')!.a).toEqual(['processing_status', ['pending', 'processing']])
        expect(o.find(x => x.m === 'lt')!.a).toEqual(['created_at', cut])
        expect(String(o.find(x => x.m === 'or')!.a[0])).toContain('processing_started_at.is.null')
        expect(o.some(x => x.m === 'delete')).toBe(false)
    })

    it('시작 시각 칸이 아직 없으면 만든 시각만으로 한 번 더', async () => {
        const { db, ops } = fakeDb([{ data: null, error: { code: '42703', message: 'column processing_started_at does not exist' } }, { data: [{ id: 'a' }], error: null }])
        expect(await failStuckSources(db, now)).toBe(1)
        expect(ops[1].some(x => x.m === 'or')).toBe(false)
    })
})
