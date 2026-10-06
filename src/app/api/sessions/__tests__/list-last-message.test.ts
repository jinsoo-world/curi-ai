// GET /api/sessions — 봇별 last_message_preview 추가, 기존 필드 유지, 본인 것만
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
const eq = vi.fn()
let user: { id: string } | null = { id: 'u1' }
const rows = [
    { id: 's1', user_id: 'u1', mentor_id: 'm1', last_message_at: '2026-10-06T01:00:00Z', mentors: { name: 'A' } },
    { id: 's2', user_id: 'u1', mentor_id: 'm2', last_message_at: null, mentors: { name: 'B' } },
]
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user } }) },
        rpc: (...a: unknown[]) => rpc(...a),
        from: () => {
            const q: Record<string, unknown> = {}
            q.select = () => q
            q.eq = (...a: unknown[]) => { eq(...a); return q }
            q.order = async () => ({ data: rows, error: null })
            return q
        },
    }),
}))
vi.mock('@/domains/chat', () => ({ createChatSession: vi.fn() }))
vi.mock('@/domains/mentor', () => ({ getMentorById: vi.fn() }))

import { GET } from '@/app/api/sessions/route'
const get = () => GET(new Request('https://x/api/sessions'))

beforeEach(() => { rpc.mockReset(); eq.mockReset(); user = { id: 'u1' } })

describe('GET /api/sessions', () => {
    it('마지막 말을 한 번에 가져와 붙이고 기존 필드는 그대로', async () => {
        rpc.mockResolvedValue({ data: [{ owner_id: 's1', content: '안녕\n하세요', created_at: 'x' }], error: null })
        const { sessions } = await (await get()).json()
        expect(rpc).toHaveBeenCalledTimes(1)
        expect(rpc).toHaveBeenCalledWith('last_messages_for_sessions', { p_ids: ['s1', 's2'] })
        expect(sessions[0]).toMatchObject({ id: 's1', mentor_id: 'm1', last_message_at: '2026-10-06T01:00:00Z', mentors: { name: 'A' }, last_message_preview: '안녕 하세요' })
        expect(sessions[1].last_message_preview).toBeNull()
        expect(eq).toHaveBeenCalledWith('user_id', 'u1')
    })
    it('함수가 없어도 목록은 나오고 미리보기는 null', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })
        const { sessions } = await (await get()).json()
        expect(sessions).toHaveLength(2)
        expect(sessions[0].last_message_preview).toBeNull()
    })
    it('손님은 지금처럼 빈 목록', async () => {
        user = null
        expect(await (await get()).json()).toEqual({ sessions: [] })
        expect(rpc).not.toHaveBeenCalled()
    })
})
