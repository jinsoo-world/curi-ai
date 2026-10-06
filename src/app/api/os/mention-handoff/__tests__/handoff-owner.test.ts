// 넘김은 내 방(fromSessionId)에만 쓰고, 넣는 글은 origin='handoff' 로 표시한다.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = { ownsSession: true }
const inserted: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/domains/os/knowledge', () => ({ assertBotInTeam: async () => {} }))
vi.mock('@/domains/agent/relay', () => ({ withRelayPrefix: (_n: string, m: string) => m }))
vi.mock('@/domains/os/mentions', () => ({ handoffAckLine: () => '넘겼어요' }))
vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
        from: (t: string) => {
            const q: Record<string, unknown> = {}
            const self = () => q
            Object.assign(q, {
                select: self, eq: self, order: self, limit: self,
                insert: (row: Record<string, unknown>) => { if (t === 'messages') inserted.push(row); return Object.assign(q, { error: null }) },
                update: self,
                maybeSingle: async () => ({ data: t === 'chat_sessions' ? (state.ownsSession ? { id: 's-from' } : null) : null }),
                single: async () => ({ data: { id: 's-new' }, error: null }),
                then: (r: (v: unknown) => void) => r({
                    data: t === 'team_bots'
                        ? [{ mentor_id: 'a', mentors: { name: 'A' } }, { mentor_id: 'b', mentors: { name: 'B' } }]
                        : [],
                    error: null,
                }),
            })
            return q
        },
    }),
}))

import { POST } from '../route'
const call = (b: Record<string, unknown>) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(b) }))

beforeEach(() => { inserted.length = 0; state.ownsSession = true })

describe('POST /api/os/mention-handoff', () => {
    it('남의 방(fromSessionId)에는 글을 심지 못한다', async () => {
        state.ownsSession = false
        const res = await call({ text: '안녕', fromMentorId: 'a', toMentorId: 'b', fromSessionId: 's-other' })
        expect(res.status).toBe(403)
        expect(inserted).toHaveLength(0)
    })

    it('내 방이면 넘김 글을 origin=handoff 로 저장한다', async () => {
        const res = await call({ text: '안녕', fromMentorId: 'a', toMentorId: 'b', fromSessionId: 's-from' })
        expect(res.status).toBe(200)
        expect(inserted.length).toBeGreaterThan(0)
        expect(inserted.every(r => r.origin === 'handoff')).toBe(true)
    })
})
