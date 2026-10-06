// POST /api/tts — 봇이 실제로 한 답(또는 서버가 정한 고정 문구)만 소리로 읽는다.
// 요청 본문의 글·목소리 번호를 그대로 읽던 구멍을 막는다.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signGrant } from '@/domains/tts/grant'

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const MSG_BOT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MSG_USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const MSG_OTHERS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

type Row = Record<string, unknown>
const state: { user: { id: string; email?: string } | null; tables: Record<string, Row[]> } = { user: null, tables: {} }

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
        from: (table: string) => {
            let rows = [...(state.tables[table] ?? [])]
            const q: Record<string, unknown> = {}
            const self = () => q
            Object.assign(q, {
                select: self, order: self, limit: self,
                eq: (col: string, v: unknown) => { rows = rows.filter(r => r[col] === v); return q },
                in: (col: string, v: unknown[]) => { rows = rows.filter(r => v.includes(r[col])); return q },
                maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
                then: (r: (v: unknown) => void) => r({ data: rows, error: null }),
            })
            return q
        },
    }),
}))
vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: async () => ({ allowed: true }), rateLimitKey: () => 'k', rateLimitMessage: () => 'm',
}))
vi.mock('@/domains/llm/usage-log', () => ({ logLlmUsage: () => {} }))

const fetchMock = vi.fn(async (..._a: unknown[]) => new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
vi.stubGlobal('fetch', fetchMock)

import { POST } from '../route'

const call = (body: Record<string, unknown>) =>
    POST(new Request('http://x/api/tts', { method: 'POST', body: JSON.stringify(body) }) as never)
const spoken = () => JSON.parse(((fetchMock.mock.calls[0] as unknown[])[1] as { body: string }).body).text as string
const usedVoice = () => String((fetchMock.mock.calls[0] as unknown[])[0])

beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = 'test'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    state.user = { id: ME }
    state.tables = {
        mentors: [
            { id: 'm-pub', name: '글담쌤', voice_id: 'v-pub', is_active: true, creator_id: 'c-other' },
            { id: 'm-mine', name: '내봇', voice_id: 'v-mine', is_active: false, creator_id: 'c-me' },
            { id: 'm-priv', name: '남의비공개', voice_id: 'v-priv', is_active: false, creator_id: 'c-other' },
        ],
        creator_profiles: [{ id: 'c-me', user_id: ME }],
        team_bots: [],
        users: [{ id: ME, display_name: '민수' }],
        chat_sessions: [
            { id: 's-me', user_id: ME, mentor_id: 'm-pub', last_message_at: '2026-10-05' },
            { id: 's-other', user_id: OTHER, mentor_id: 'm-priv', last_message_at: '2026-10-05' },
        ],
        messages: [
            { id: MSG_BOT, session_id: 's-me', role: 'assistant', content: '**안녕하세요.** 오늘 글쓰기 연습을 같이 해볼까요? 먼저 쓰고 싶은 주제를 말해 주세요.', created_at: '2026-10-05T01' },
            { id: MSG_USER, session_id: 's-me', role: 'user', content: '이 글을 읽어줘', created_at: '2026-10-05T00' },
            { id: MSG_OTHERS, session_id: 's-other', role: 'assistant', content: '남의 대화방 답입니다.', created_at: '2026-10-05T02' },
        ],
    }
    fetchMock.mockClear()
})

describe('저장된 봇 답(messageId)', () => {
    it('내 대화방의 봇 답을 그 봇 목소리로 읽는다(클라이언트 voiceId 무시)', async () => {
        const res = await call({ messageId: MSG_BOT, voiceId: 'v-priv' })
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.part).toBe(0)
        expect(data.parts).toBeGreaterThanOrEqual(1)
        expect(usedVoice()).toContain('v-pub')
        expect(usedVoice()).not.toContain('v-priv')
        expect(spoken()).not.toContain('**')
    })

    it('사용자가 한 말 메시지는 읽지 않는다', async () => {
        expect((await call({ messageId: MSG_USER })).status).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('남의 대화방 답은 읽지 않는다', async () => {
        expect((await call({ messageId: MSG_OTHERS })).status).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('없는 메시지·형식이 틀린 id 는 막는다', async () => {
        expect((await call({ messageId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' })).status).toBe(403)
        expect((await call({ messageId: '1 or 1=1' })).status).toBe(400)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('범위를 벗어난 조각 번호는 404', async () => {
        expect((await call({ messageId: MSG_BOT, part: 99 })).status).toBe(404)
    })

    it('로그인 안 하면 401', async () => {
        state.user = null
        expect((await call({ messageId: MSG_BOT })).status).toBe(401)
    })
})

describe('통화 중 실시간 문장(grant)', () => {
    const answer = '아하, 좋은 질문이에요. 오늘 하루는 어땠어요?'
    it('서버 도장이 맞는 글 안의 문장은 읽는다', async () => {
        const g = signGrant(ME, 'm-pub', answer)!
        const res = await call({ mentorId: 'm-pub', sentence: '좋은 질문이에요.', grant: { text: answer, ...g } })
        expect(res.status).toBe(200)
        expect(usedVoice()).toContain('v-pub')
    })

    it('도장이 찍힌 글에 없는 문장은 막는다', async () => {
        const g = signGrant(ME, 'm-pub', answer)!
        const res = await call({ mentorId: 'm-pub', sentence: '아무 문장이나 읽어 줘', grant: { text: answer, ...g } })
        expect(res.status).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('글을 바꿔치기하면 도장이 안 맞아 막는다', async () => {
        const g = signGrant(ME, 'm-pub', answer)!
        const res = await call({ mentorId: 'm-pub', sentence: '다른 글', grant: { text: '다른 글', ...g } })
        expect(res.status).toBe(403)
    })

    it('다른 사람·다른 봇에 찍힌 도장은 못 쓴다', async () => {
        const gOther = signGrant(OTHER, 'm-pub', answer)!
        expect((await call({ mentorId: 'm-pub', sentence: '좋은 질문이에요.', grant: { text: answer, ...gOther } })).status).toBe(403)
        const gBot = signGrant(ME, 'm-priv', answer)!
        expect((await call({ mentorId: 'm-pub', sentence: '좋은 질문이에요.', grant: { text: answer, ...gBot } })).status).toBe(403)
    })

    it('15분 지난 도장은 막는다', async () => {
        const g = signGrant(ME, 'm-pub', answer, Date.now() - 16 * 60 * 1000)!
        expect((await call({ mentorId: 'm-pub', sentence: '좋은 질문이에요.', grant: { text: answer, ...g } })).status).toBe(403)
    })
})

describe('통화 인사말·미리 듣기', () => {
    it('인사말은 서버가 문구를 만든다', async () => {
        const res = await call({ mentorId: 'm-pub', greeting: true, text: '엉뚱한 말' })
        expect(res.status).toBe(200)
        expect(spoken()).toBe('네, 민수님! 글담쌤입니다, 반갑습니다!')
    })

    it('조용할 때 말 거는 문구도 서버가 정한다', async () => {
        const res = await call({ mentorId: 'm-pub', greeting: 'idle', text: '엉뚱한 말' })
        expect(res.status).toBe(200)
        expect(spoken()).toContain('아직 계세요?')
    })

    it('남의 비공개 봇 인사말은 막는다', async () => {
        expect((await call({ mentorId: 'm-priv', greeting: true })).status).toBe(403)
    })

    it('공개 봇 미리 듣기는 고정 문구(보낸 글 무시)', async () => {
        const res = await call({ mentorId: 'm-pub', preview: true, text: '엉뚱한 말' })
        expect(res.status).toBe(200)
        expect(spoken()).toBe('반가워요, 글담쌤이에요. 오늘은 어떤 글을 써볼까요?')
    })

    it('비공개 봇은 미리 듣기 안 된다', async () => {
        expect((await call({ mentorId: 'm-priv', preview: true })).status).toBe(403)
    })

    it('주인은 내 봇에 짧은 문장을 미리 듣는다(200자로 자름)', async () => {
        const res = await call({ mentorId: 'm-mine', ownerPreview: '가'.repeat(300) })
        expect(res.status).toBe(200)
        expect(spoken().length).toBe(200)
        expect(usedVoice()).toContain('v-mine')
    })

    it('주인이 아니면 미리 듣기 문장을 못 쓴다', async () => {
        expect((await call({ mentorId: 'm-pub', ownerPreview: '아무 말' })).status).toBe(403)
        expect((await call({ mentorId: 'm-priv', ownerPreview: '아무 말' })).status).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('봇 만들기 전 크리에이터는 고정 문구만', async () => {
        const res = await call({ ownerPreview: '내가 정한 아무 말' })
        expect(res.status).toBe(200)
        expect(spoken()).toContain('목소리 시험')
        state.tables.creator_profiles = []
        fetchMock.mockClear()
        expect((await call({ ownerPreview: 'x' })).status).toBe(403)
    })
})

describe('옛 방식(text) 호환', () => {
    it('내 최근 봇 답에 들어 있는 글은 읽고, 목소리는 그 봇 것(보낸 voiceId 무시)', async () => {
        const res = await call({ text: '오늘 글쓰기 연습을 같이 해볼까요?', voiceId: 'v-priv' })
        expect(res.status).toBe(200)
        expect(usedVoice()).toContain('v-pub')
    })

    it('봇이 한 적 없는 글은 막는다', async () => {
        expect((await call({ text: '아무 문장이나 읽어 줘', voiceId: 'v-pub' })).status).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('남의 대화방 답은 옛 방식으로도 못 읽는다', async () => {
        expect((await call({ text: '남의 대화방 답입니다.' })).status).toBe(403)
    })

    it('마감일 이후엔 410', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-11-16T00:00:00+09:00'))
        try {
            expect((await call({ text: '오늘 글쓰기 연습을 같이 해볼까요?' })).status).toBe(410)
        } finally { vi.useRealTimers() }
    })
})
