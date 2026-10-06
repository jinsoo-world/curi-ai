// POST /api/tts — 복제 목소리(voice_id)는 공개 봇이거나 내 봇일 때만 쓴다
// 아무 목소리 ID 나 넣어 남의 비공개 복제 목소리, 일레븐랩스 다른 목소리를 쓰는 구멍을 막는다.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const ME = '11111111-1111-4111-8111-111111111111'
const state: {
    user: { id: string } | null
    mentors: { id: string; is_active: boolean; creator_id: string | null }[]
    myCreators: { id: string }[]
} = { user: null, mentors: [], myCreators: [] }

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
        from: (table: string) => {
            const q: Record<string, unknown> = {}
            const self = () => q
            Object.assign(q, { select: self, eq: self, in: self, limit: self })
            const data = table === 'mentors' ? state.mentors : table === 'creator_profiles' ? state.myCreators : []
            Object.assign(q, { then: (r: (v: unknown) => void) => r({ data, error: null }) })
            return q
        },
    }),
}))
vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: async () => ({ allowed: true }), rateLimitKey: () => 'k', rateLimitMessage: () => 'm',
}))
vi.mock('@/domains/llm/usage-log', () => ({ logLlmUsage: () => {} }))

const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
vi.stubGlobal('fetch', fetchMock)

import { POST } from '../route'

const call = (body: Record<string, unknown>) =>
    POST(new Request('http://x/api/tts', { method: 'POST', body: JSON.stringify(body) }) as never)

beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = 'test'
    state.user = { id: ME }; state.mentors = []; state.myCreators = []
    fetchMock.mockClear()
})

describe('POST /api/tts 목소리 판정', () => {
    it('목소리 없이 부르면 기본 목소리로 읽는다', async () => {
        const res = await call({ text: '안녕' })
        expect(res.status).toBe(200)
        expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('pFZP5JQG7iQjIQuC4Bku')
    })

    it('공개 봇의 목소리는 누구나 쓴다(채팅 듣기)', async () => {
        state.mentors = [{ id: 'm1', is_active: true, creator_id: 'c-other' }]
        const res = await call({ text: '안녕', voiceId: 'v-public' })
        expect(res.status).toBe(200)
        expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('v-public')
    })

    it('내 비공개 봇의 목소리는 쓴다', async () => {
        state.mentors = [{ id: 'm2', is_active: false, creator_id: 'c-me' }]
        state.myCreators = [{ id: 'c-me' }]
        const res = await call({ text: '안녕', voiceId: 'v-mine' })
        expect(res.status).toBe(200)
    })

    it('남의 비공개 봇 목소리는 막는다', async () => {
        state.mentors = [{ id: 'm3', is_active: false, creator_id: 'c-other' }]
        state.myCreators = [{ id: 'c-me' }]
        const res = await call({ text: '안녕', voiceId: 'v-private' })
        expect(res.status).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('어느 봇에도 없는 목소리 ID 는 막는다', async () => {
        const res = await call({ text: '안녕', voiceId: 'v-random' })
        expect(res.status).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
