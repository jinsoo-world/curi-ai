// 탈퇴 때 앱 알림 기기 번호와 보낸 알림 기록을 지운다 (개인 콘텐츠, 1002)
/* eslint-disable @typescript-eslint/no-explicit-any -- 시험용 가짜 DB */
import { describe, it, expect } from 'vitest'
import { deleteAccount } from '@/domains/account/delete'

function fakeDb() {
    const calls: { table: string; mode: string; eq: unknown[][] }[] = []
    const from = (table: string) => {
        const c = { table, mode: 'select', eq: [] as unknown[][] }
        calls.push(c)
        const q: any = {
            select: () => q, in: () => q, order: () => q, limit: () => q, lt: () => q,
            update: () => { c.mode = 'update'; return q },
            delete: () => { c.mode = 'delete'; return q },
            upsert: () => { c.mode = 'upsert'; return q },
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

describe('탈퇴와 앱 알림', () => {
    it('push_sends 를 먼저, push_devices 를 그다음 내 것만 지운다', async () => {
        const { db, calls } = fakeDb()
        expect((await deleteAccount(db, { id: 'u1', email: 'a@b.c', provider: 'apple' })).ok).toBe(true)
        const sends = calls.findIndex(c => c.table === 'push_sends' && c.mode === 'delete')
        const devices = calls.findIndex(c => c.table === 'push_devices' && c.mode === 'delete')
        expect(sends).toBeGreaterThan(-1)
        expect(devices).toBeGreaterThan(sends)
        expect(calls[sends].eq).toEqual([['user_id', 'u1']])
        expect(calls[devices].eq).toEqual([['user_id', 'u1']])
    })
})
