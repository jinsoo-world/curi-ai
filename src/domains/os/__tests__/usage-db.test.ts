import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readUsage, countUserTurnsForMentor } from '../usage-db'

/** rpc 와 옛 방식(from) 둘 다 흉내. 어느 길을 썼는지 calls 에 남긴다 */
function fakeDb(o: { rpc?: 'ok' | 'missing' | 'error'; turns?: number; plan?: { plan: string; expires_at: string | null } | null; planError?: boolean; sessionIds?: string[]; oldCount?: number }) {
    const calls: string[] = []
    const db = {
        calls,
        async rpc(name: string, args: Record<string, unknown>) {
            calls.push(`rpc:${name}:${args.p_mentor ?? ''}`)
            if (o.rpc === 'missing') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
            if (o.rpc === 'error') return { data: null, error: { code: '57014', message: 'timeout' } }
            return { data: [{ turns: o.turns ?? 0, oldest: null }], error: null }
        },
        from(table: string) {
            const q = {
                select() { return q }, eq() { return q }, in() { return q }, gte() { return q }, order() { return q }, limit() { return q },
                maybeSingle() {
                    calls.push(`from:${table}:single`)
                    if (table === 'user_plans') return Promise.resolve(o.planError ? { data: null, error: { message: 'timeout' } } : { data: o.plan ?? null, error: null })
                    return Promise.resolve({ data: null, error: null })
                },
                then(res: (v: unknown) => unknown) {
                    calls.push(`from:${table}`)
                    if (table === 'chat_sessions') return Promise.resolve({ data: (o.sessionIds ?? []).map(id => ({ id })), error: null }).then(res)
                    if (table === 'channels') return Promise.resolve({ data: [], error: null }).then(res)
                    return Promise.resolve({ data: [], count: o.oldCount ?? 0, error: null }).then(res)
                },
            }
            return q
        },
    }
    return db as unknown as SupabaseClient & { calls: string[] }
}

const now = new Date('2026-10-20T03:00:00Z')

describe('사용량 세기 — DB 함수 하나로', () => {
    it('함수가 있으면 함수 한 번으로 센다 (대화방 id 를 주소에 안 넣는다)', async () => {
        const db = fakeDb({ rpc: 'ok', turns: 5 })
        const v = await readUsage(db, 'u1', now)
        expect(v.used).toBe(5)
        expect(db.calls.some(c => c.startsWith('rpc:count_user_turns'))).toBe(true)
        expect(db.calls).not.toContain('from:chat_sessions')
    })

    it('함수가 아직 없으면 옛 방식으로 센다', async () => {
        const db = fakeDb({ rpc: 'missing', sessionIds: ['s1'], oldCount: 3 })
        const v = await readUsage(db, 'u1', now)
        expect(v.used).toBe(3)
        expect(db.calls).toContain('from:chat_sessions')
    })

    it('봇별 주간 횟수도 같은 함수(봇 번호 넣어)로', async () => {
        const db = fakeDb({ rpc: 'ok', turns: 2 })
        expect(await countUserTurnsForMentor(db, 'u1', 'm1', now)).toBe(2)
        expect(db.calls).toContain('rpc:count_user_turns:m1')
    })
})

describe('요금제 읽기 실패 = 막지 않고 통과', () => {
    it('요금제 표 읽기가 실패하면 한도를 넘었어도 막지 않는다', async () => {
        const db = fakeDb({ rpc: 'ok', turns: 99_999, planError: true })
        const v = await readUsage(db, 'u1', now)
        expect(v.blocked).toBe(false)
        expect(v.planUnknown).toBe(true)
    })

    it('정상으로 읽었고 무료 한도를 넘었으면 막는다(기존 그대로)', async () => {
        const db = fakeDb({ rpc: 'ok', turns: 99_999, plan: null })
        const v = await readUsage(db, 'u1', now)
        expect(v.blocked).toBe(true)
        expect(v.planUnknown).toBeFalsy()
    })
})
