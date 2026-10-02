// message_log.to_hash 칸·pending 상태가 아직 없어도(마이그레이션 전) 기록·세기·예약이 멈추지 않는다
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseStore } from '../store'
import { createOutboundGuardStore } from '../outbound-guard'

type Call = { op: string; payload?: unknown; cols?: string; statuses?: unknown }

function fakeDb(opts: { hasHashColumn: boolean; hasPending?: boolean; rows?: Record<string, unknown>[] }) {
    const calls: Call[] = []
    const missing = { code: 'PGRST204', message: "Could not find the 'to_hash' column" }
    const checkFail = { code: '23514', message: 'violates check constraint "message_log_status_check"' }
    const db = {
        from: () => ({
            insert: (payload: Record<string, unknown>) => {
                calls.push({ op: 'insert', payload })
                const res = ('to_hash' in payload && !opts.hasHashColumn) ? { data: null, error: missing }
                    : (payload.status === 'pending' && !opts.hasPending) ? { data: null, error: checkFail }
                        : { data: { id: 'new-id' }, error: null }
                const p = Promise.resolve(res)
                return Object.assign(p, { select: () => ({ single: async () => res }) })
            },
            delete: () => ({ eq: async (_c: string, id: string) => { calls.push({ op: 'delete', payload: id }); return { error: null } } }),
            select: (cols: string) => {
                const call: Call = { op: 'select', cols }
                calls.push(call)
                const q = {
                    eq: () => q, not: () => q, gte: () => q,
                    in: (_c: string, v: unknown) => { call.statuses = v; return q },
                    limit: async () => (cols.includes('to_hash') && !opts.hasHashColumn)
                        ? { data: null, error: { code: '42703', message: 'column message_log.to_hash does not exist' } }
                        : { data: opts.rows ?? [], error: null },
                }
                return q
            },
        }),
    }
    return { db: db as unknown as SupabaseClient, calls }
}

const entry = { userId: 'u1', channel: 'email' as const, toHint: '.com', toHash: 'abc', subject: null, status: 'sent' as const, permissionRequestId: 'c1', error: null }
const SINCE = '2026-10-01T15:00:00.000Z'

describe('message_log to_hash', () => {
    it('칸이 있으면 지문까지 한 번에 적는다', async () => {
        const { db, calls } = fakeDb({ hasHashColumn: true })
        await createSupabaseStore(db).log(entry)
        expect(calls.filter(c => c.op === 'insert')).toHaveLength(1)
        expect((calls[0].payload as Record<string, unknown>).to_hash).toBe('abc')
    })
    it('칸이 없으면 지문만 빼고 다시 적는다(기록이 사라지지 않는다)', async () => {
        const { db, calls } = fakeDb({ hasHashColumn: false })
        await createSupabaseStore(db).log(entry)
        const inserts = calls.filter(c => c.op === 'insert')
        expect(inserts).toHaveLength(2)
        expect('to_hash' in (inserts[1].payload as Record<string, unknown>)).toBe(false)
    })
    it('지문이 없는 기록은 칸을 넣지 않는다', async () => {
        const { db, calls } = fakeDb({ hasHashColumn: false })
        await createSupabaseStore(db).log({ ...entry, toHash: null })
        expect(calls.filter(c => c.op === 'insert')).toHaveLength(1)
    })
    it('세기: 보냄·실패·보내는 중(pending)을 다 세고, 지문 목록을 돌려준다', async () => {
        const { db, calls } = fakeDb({ hasHashColumn: true, rows: [{ id: 'a', to_hash: 'h1' }, { id: 'b', to_hash: null }] })
        const r = await createOutboundGuardStore(db).listSentToday('u1', SINCE)
        expect(r).toEqual([{ id: 'a', toHash: 'h1' }, { id: 'b', toHash: null }])
        expect(calls.find(c => c.op === 'select')?.statuses).toEqual(['sent', 'failed', 'pending'])
    })
    it('세기: 칸이 없으면 지문은 모른다(null)', async () => {
        const { db } = fakeDb({ hasHashColumn: false, rows: [{ id: 'a' }, { id: 'b' }] })
        const r = await createOutboundGuardStore(db).listSentToday('u1', SINCE)
        expect(r).toEqual([{ id: 'a', toHash: null }, { id: 'b', toHash: null }])
    })
    it('예약: pending 줄을 적고 id 를 돌려준다', async () => {
        const { db, calls } = fakeDb({ hasHashColumn: true, hasPending: true })
        const id = await createOutboundGuardStore(db).reserve({ userId: 'u1', permissionRequestId: 'c1', toHash: 'h', toHint: '.com' })
        expect(id).toBe('new-id')
        expect((calls[0].payload as Record<string, unknown>).status).toBe('pending')
    })
    it('예약: pending 상태가 아직 없으면(마이그레이션 전) null. 막지 않는다', async () => {
        const { db } = fakeDb({ hasHashColumn: true, hasPending: false })
        expect(await createOutboundGuardStore(db).reserve({ userId: 'u1', permissionRequestId: 'c1', toHash: 'h', toHint: '.com' })).toBeNull()
    })
    it('예약 풀기: 그 줄을 지운다. id 가 없으면 아무것도 안 한다', async () => {
        const { db, calls } = fakeDb({ hasHashColumn: true })
        const s = createOutboundGuardStore(db)
        await s.release('new-id')
        await s.release(null)
        expect(calls.filter(c => c.op === 'delete')).toEqual([{ op: 'delete', payload: 'new-id' }])
    })
})
