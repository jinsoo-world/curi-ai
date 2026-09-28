import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTeamBot, bootstrapDefaultTeam } from './team'
import { createMentorDraft } from '@/domains/creator/actions'
import { recordBotCreated } from './bot-events'

type Ins = { table: string; row: Record<string, unknown> }

/** 넣은 줄을 적어 두는 가짜 db */
function fakeDb(opts: { failEvents?: boolean } = {}) {
    const inserts: Ins[] = []
    let n = 0
    const db = {
        from(table: string) {
            const q: Record<string, unknown> = {}
            let result: { data: unknown; error: unknown } = { data: null, error: null }
            const chain = new Proxy(q, {
                get(_t, k: string) {
                    if (k === 'then') return (res: (v: unknown) => void) => res(result)
                    if (k === 'insert') return (row: Record<string, unknown>) => {
                        inserts.push({ table, row })
                        if (table === 'app_events' && opts.failEvents) result = { data: null, error: { message: 'boom' } }
                        else result = { data: { id: `${table}-${++n}`, name: row.name, created_at: 'now', role: row.role, ...row }, error: null }
                        return chain
                    }
                    if (k === 'maybeSingle') return () => Promise.resolve(table === 'creator_profiles' ? { data: { id: 'cp1' }, error: null } : result)
                    if (k === 'single') return () => Promise.resolve(result)
                    if (k === 'select' && table === 'team_bots' && !inserts.some(i => i.table === 'team_bots'))
                        return () => { result = { data: [], error: null }; return chain }
                    return () => chain
                },
            })
            return chain
        },
    }
    return { db: db as unknown as SupabaseClient, inserts }
}

const events = (ins: Ins[]) => ins.filter(i => i.table === 'app_events').map(i => i.row)
const user = { id: 'u1', displayName: '진' }
const input = { job: 'custom', customJob: '메일', autonomy: 'always_ask', name: '봇', shape: 'circle', color: 'orange' } as const

describe('os_bot_created 서버 기록', () => {
    it('＋ 개인봇 = 봇 하나에 기록 하나, path/mentor_id/user_id', async () => {
        const { db, inserts } = fakeDb()
        const bot = await createTeamBot(db, user, { ...input } as never)
        const ev = events(inserts)
        expect(ev).toHaveLength(1)
        expect(ev[0]).toMatchObject({ name: 'os_bot_created', user_id: 'u1', extra: { path: 'os_new_bot', mentor_id: bot.mentorId, user_id: 'u1' } })
    })
    it('분신 초안 path', async () => {
        const { db, inserts } = fakeDb()
        await createTeamBot(db, user, { ...input } as never, 'twin_draft')
        expect(events(inserts)[0].extra).toMatchObject({ path: 'twin_draft' })
    })
    it('온보딩 = 만든 봇 수만큼', async () => {
        const { db, inserts } = fakeDb()
        const { created } = await bootstrapDefaultTeam(db, user).catch(() => ({ created: -1 }))
        const ev = events(inserts)
        const mentors = inserts.filter(i => i.table === 'mentors').length
        expect(mentors).toBeGreaterThan(0)
        expect(ev).toHaveLength(mentors)
        expect(ev.every(e => (e.extra as { path: string }).path === 'onboarding')).toBe(true)
        expect(created).not.toBe(0)
    })
    it('옛 /creator/create', async () => {
        const { db, inserts } = fakeDb()
        const m = await createMentorDraft(db, 'cp1', { name: 'a', title: 'b', description: '', expertise: [] } as never, 'u1')
        expect(events(inserts)).toEqual([expect.objectContaining({ extra: { path: 'creator_create', mentor_id: m.id, user_id: 'u1' } })])
    })
    it('기록 실패해도 던지지 않는다', async () => {
        const { db } = fakeDb({ failEvents: true })
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        await expect(recordBotCreated(db, { path: 'os_new_bot', mentorId: 'm', userId: 'u' })).resolves.toBeUndefined()
        spy.mockRestore()
    })
})
