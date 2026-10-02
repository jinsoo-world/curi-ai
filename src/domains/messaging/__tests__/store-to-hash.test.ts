// message_log.to_hash 칸이 아직 없어도(마이그레이션 전) 기록과 세기가 멈추지 않는다
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseStore } from '../store'
import { createOutboundGuardStore } from '../outbound-guard'

type Call = { op: string; payload?: unknown; cols?: string }

function fakeDb(opts: { hasHashColumn: boolean; rows?: Record<string, unknown>[] }) {
    const calls: Call[] = []
    const missing = { code: 'PGRST204', message: "Could not find the 'to_hash' column" }
    const db = {
        from: () => ({
            insert: async (payload: Record<string, unknown>) => {
                calls.push({ op: 'insert', payload })
                if ('to_hash' in payload && !opts.hasHashColumn) return { error: missing }
                return { error: null }
            },
            select: (cols: string) => {
                calls.push({ op: 'select', cols })
                const q = {
                    eq: () => q, in: () => q, not: () => q, gte: () => q,
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
    it('세기: 칸이 있으면 지문 목록을 돌려준다', async () => {
        const { db } = fakeDb({ hasHashColumn: true, rows: [{ to_hash: 'h1' }, { to_hash: null }] })
        const r = await createOutboundGuardStore(db).countSentToday('u1', '2026-10-01T15:00:00.000Z')
        expect(r).toEqual({ total: 2, recipientHashes: ['h1', null] })
    })
    it('세기: 칸이 없으면 통 수만 세고 지문은 모른다(null)', async () => {
        const { db } = fakeDb({ hasHashColumn: false, rows: [{ id: 1 }, { id: 2 }, { id: 3 }] })
        const r = await createOutboundGuardStore(db).countSentToday('u1', '2026-10-01T15:00:00.000Z')
        expect(r).toEqual({ total: 3, recipientHashes: null })
    })
})
