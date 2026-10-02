// 탈퇴 때 고객센터 문의는 지우지 않고 사람과의 연결만 끊는다 (문의 기록 3년 보관, 1002)
/* eslint-disable @typescript-eslint/no-explicit-any -- 시험용 가짜 DB */
import { describe, it, expect } from 'vitest'
import { deleteAccount } from '@/domains/account/delete'

function fakeDb() {
    const calls: { table: string; mode: string; patch?: unknown; eq: unknown[][] }[] = []
    const from = (table: string) => {
        const c = { table, mode: 'select', patch: undefined as unknown, eq: [] as unknown[][] }
        calls.push(c)
        const q: any = {
            select: () => q, in: () => q, order: () => q, limit: () => q, lt: () => q,
            update: (p: unknown) => { c.mode = 'update'; c.patch = p; return q },
            delete: () => { c.mode = 'delete'; return q },
            upsert: (p: unknown) => { c.mode = 'upsert'; c.patch = p; return q },
            eq: (...a: unknown[]) => { c.eq.push(a); return q },
            ilike: (...a: unknown[]) => { c.eq.push(a); return q },
            maybeSingle: async () => ({ data: null, error: null }),
            then: (ok: any) => ok({ data: [], error: null }),
        }
        return q
    }
    const storage = { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ data: null, error: null }) }) }
    const auth = { admin: { deleteUser: async () => ({ error: null }) } }
    return { db: { from, storage, auth } as any, calls }
}

describe('탈퇴와 고객센터 문의', () => {
    it('support_inquiries 는 user_id 만 비우고 지우지 않는다', async () => {
        const { db, calls } = fakeDb()
        expect((await deleteAccount(db, { id: 'u1', email: 'a@b.c', provider: 'kakao' })).ok).toBe(true)
        const mine = calls.filter(c => c.table === 'support_inquiries')
        expect(mine).toHaveLength(1)
        expect(mine[0].mode).toBe('update')
        expect(mine[0].patch).toEqual({ user_id: null })
        expect(mine[0].eq).toEqual([['user_id', 'u1']])
    })
})
