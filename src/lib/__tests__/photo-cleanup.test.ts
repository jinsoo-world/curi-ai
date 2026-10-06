import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('쓰면 안 됨') } }))
import { 만료된것_지우기, 지우기_묶음 } from '../photo-store'

function fakeDb(total: number, opts: { storageFailFirst?: boolean } = {}) {
    let left = Array.from({ length: total }, (_, i) => ({ id: `p${i}`, path: `x/${i}.png` }))
    const removed: number[] = []
    let storageCalls = 0
    const db = {
        from: () => {
            let mode: 'select' | 'delete' = 'select'
            let lim = 0
            let skip: string[] = []
            let ids: string[] = []
            const q: Record<string, unknown> = {}
            q.select = () => q
            q.lt = () => q
            q.order = () => q
            q.limit = (n: number) => { lim = n; return q }
            q.not = (_c: string, _op: string, v: string) => { skip = v.slice(1, -1).split(','); return q }
            q.delete = () => { mode = 'delete'; return q }
            q.in = (_c: string, v: string[]) => { ids = v; return q }
            q.then = (res: (v: unknown) => unknown) => {
                if (mode === 'select') return Promise.resolve({ data: left.filter(r => !skip.includes(r.id)).slice(0, lim), error: null }).then(res)
                left = left.filter(r => !ids.includes(r.id))
                return Promise.resolve({ error: null }).then(res)
            }
            return q
        },
        storage: { from: () => ({ remove: async (paths: string[]) => {
            storageCalls++
            if (opts.storageFailFirst && storageCalls === 1) return { error: { message: 'storage down' } }
            removed.push(paths.length); return { error: null }
        } }) },
    }
    return { db: db as never, removed, left: () => left }
}

describe('48시간 지난 사진 지우기', () => {
    it('100개씩 끝까지 지운다', async () => {
        const f = fakeDb(250)
        const r = await 만료된것_지우기({ db: f.db, deadlineMs: Date.now() + 10_000 })
        expect(r).toEqual({ 지움: 250, 오류: 0, 첫오류: null })
        expect(f.removed).toEqual([지우기_묶음, 지우기_묶음, 50])
    })
    it('저장소 삭제가 실패한 묶음은 DB 줄을 남기고(다음 날 다시) 오류로 센다', async () => {
        const f = fakeDb(150, { storageFailFirst: true })
        const r = await 만료된것_지우기({ db: f.db, deadlineMs: Date.now() + 10_000 })
        expect(r.오류).toBe(1)
        expect(r.첫오류).toContain('storage down')
        expect(r.지움).toBe(50)
        expect(f.left()).toHaveLength(100)
    })
})
