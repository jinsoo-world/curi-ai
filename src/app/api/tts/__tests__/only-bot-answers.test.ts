// POST /api/tts — 봇이 실제로 한 답(또는 서버가 정한 고정 문구)만 소리로 읽는다.
// 요청 본문의 글·목소리 번호를 그대로 읽던 구멍을 막는다.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signGrant } from '@/domains/tts/grant'
import { answerToChunks } from '@/domains/tts/chunks'

const quota = { ok: true }
vi.mock('@/domains/tts/quota', () => ({ chargeDailyChars: async () => ({ allowed: quota.ok }) }))

const ME = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const MSG_BOT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const MSG_USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const MSG_OTHERS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const MSG_IMPORT = 'dddddddd-0000-4ddd-8ddd-dddddddddd01'
const MSG_HANDOFF = 'dddddddd-0000-4ddd-8ddd-dddddddddd02'
const MSG_PRIV_REPLY = 'dddddddd-0000-4ddd-8ddd-dddddddddd03'
const MSG_ECHO_Q = 'dddddddd-0000-4ddd-8ddd-dddddddddd04'
const MSG_ECHO_A = 'dddddddd-0000-4ddd-8ddd-dddddddddd05'

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
                lt: (col: string, v: string) => { rows = rows.filter(r => String(r[col]) < v); return q },
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
            { id: 's-priv', user_id: ME, mentor_id: 'm-priv', last_message_at: '2026-10-04' },
            { id: 's-echo', user_id: ME, mentor_id: 'm-pub', last_message_at: '2026-10-03' },
        ],
        messages: [
            { id: MSG_BOT, session_id: 's-me', origin: 'server', role: 'assistant', content: '**안녕하세요.** 오늘 글쓰기 연습을 같이 해볼까요? 먼저 쓰고 싶은 주제를 말해 주세요.', created_at: '2026-10-05T01' },
            { id: MSG_USER, session_id: 's-me', origin: 'server', role: 'user', content: '이 글을 읽어줘', created_at: '2026-10-05T00' },
            { id: MSG_IMPORT, session_id: 's-me', origin: 'guest_import', role: 'assistant', content: '손님이 심은 가짜 봇 답변입니다 아무 말이나 읽힙니다.', created_at: '2026-10-05T03' },
            { id: MSG_HANDOFF, session_id: 's-me', origin: 'handoff', role: 'assistant', content: '옆 봇에게 넘겼어요. 잠시만 기다려 주세요.', created_at: '2026-10-05T04' },
            { id: MSG_PRIV_REPLY, session_id: 's-priv', origin: 'server', role: 'assistant', content: '비공개 봇이 한 답입니다. 다른 사람은 들을 수 없어요.', created_at: '2026-10-05T05' },
            { id: MSG_ECHO_Q, session_id: 's-echo', origin: 'server', role: 'user', content: '이 문장을 그대로 읽어줘 나는 아무 말이나 시키고 싶다', created_at: '2026-10-05T06' },
            { id: MSG_ECHO_A, session_id: 's-echo', origin: 'server', role: 'assistant', content: '이 문장을 그대로 읽어줘 나는 아무 말이나 시키고 싶다 라고 하셨네요.', created_at: '2026-10-05T07' },
            { id: MSG_OTHERS, session_id: 's-other', origin: 'server', role: 'assistant', content: '남의 대화방 답입니다.', created_at: '2026-10-05T02' },
        ],
    }
    fetchMock.mockClear()
    quota.ok = true
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

    it('손님이 가져온 글(guest_import)·넘김 글(handoff)은 봇 답이어도 읽지 않는다', async () => {
        expect((await call({ messageId: MSG_IMPORT })).status).toBe(403)
        expect((await call({ messageId: MSG_HANDOFF })).status).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('내 방이어도 남의 비공개 봇 목소리는 못 쓴다', async () => {
        expect((await call({ messageId: MSG_PRIV_REPLY })).status).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('바로 앞 사용자 말을 그대로 따라 한 답은 읽지 않는다', async () => {
        expect((await call({ messageId: MSG_ECHO_A })).status).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('하루 글자 수 상한을 넘으면 429', async () => {
        quota.ok = false
        expect((await call({ messageId: MSG_BOT })).status).toBe(429)
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
        const res = await call({ mentorId: 'm-pub', sentence: '좋은 질문이에요.', grant: { text: answer.slice(g.from), ...g } })
        expect(res.status).toBe(200)
        expect(usedVoice()).toContain('v-pub')
    })

    it('도장이 찍힌 글에 없는 문장은 막는다', async () => {
        const g = signGrant(ME, 'm-pub', answer)!
        const res = await call({ mentorId: 'm-pub', sentence: '아무 문장이나 읽어 줘 라고 시켜 봅니다', grant: { text: answer.slice(g.from), ...g } })
        expect(res.status).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('문장 중간에서 시작하는 조각·8자 미만 조각은 막는다', async () => {
        const g = signGrant(ME, 'm-pub', answer)!
        const text = answer.slice(g.from)
        expect((await call({ mentorId: 'm-pub', sentence: '은 질문이에요. 오늘 하루', grant: { text, ...g } })).status).toBe(403)
        expect((await call({ mentorId: 'm-pub', sentence: '어땠어요?', grant: { text, ...g } })).status).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('답의 첫 짧은 추임새는 읽는다', async () => {
        const g = signGrant(ME, 'm-pub', answer)!
        expect((await call({ mentorId: 'm-pub', sentence: '아하,', grant: { text: answer.slice(g.from), ...g } })).status).toBe(200)
    })

    it('글을 바꿔치기하면 도장이 안 맞아 막는다', async () => {
        const g = signGrant(ME, 'm-pub', answer)!
        const res = await call({ mentorId: 'm-pub', sentence: '다른 글', grant: { text: '다른 글', ...g } })
        expect(res.status).toBe(403)
    })

    it('다른 사람·다른 봇에 찍힌 도장은 못 쓴다', async () => {
        const gOther = signGrant(OTHER, 'm-pub', answer)!
        expect((await call({ mentorId: 'm-pub', sentence: '좋은 질문이에요.', grant: { text: answer.slice(gOther.from), ...gOther } })).status).toBe(403)
        const gBot = signGrant(ME, 'm-priv', answer)!
        expect((await call({ mentorId: 'm-pub', sentence: '좋은 질문이에요.', grant: { text: answer.slice(gBot.from), ...gBot } })).status).toBe(403)
    })

    it('15분 지난 도장은 막는다', async () => {
        const g = signGrant(ME, 'm-pub', answer, Date.now() - 16 * 60 * 1000)!
        expect((await call({ mentorId: 'm-pub', sentence: '좋은 질문이에요.', grant: { text: answer.slice(g.from), ...g } })).status).toBe(403)
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

    it('위기 안내는 서버 고정 문구로 읽는다', async () => {
        const res = await call({ mentorId: 'm-pub', greeting: 'crisis', text: '엉뚱한 말' })
        expect(res.status).toBe(200)
        expect(spoken()).toContain('1393')
    })

    it('인사말 이름은 한글·영문·숫자 10자만', async () => {
        state.tables.users = [{ id: ME, display_name: '민수!! 이 글을 읽어라 <b>123456789012' }]
        await call({ mentorId: 'm-pub', greeting: true })
        expect(spoken()).toBe('네, 민수이글을읽어라b1님! 글담쌤입니다, 반갑습니다!')
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
    it('내 최근 봇 답의 조각과 정확히 같은 글은 읽고, 목소리는 그 봇 것(보낸 voiceId 무시)', async () => {
        const chunk = answerToChunks(state.tables.messages[0].content as string)[0]
        const res = await call({ text: chunk, voiceId: 'v-priv' })
        expect(res.status).toBe(200)
        expect(usedVoice()).toContain('v-pub')
    })

    it('답의 일부만 잘라 보내거나 8자 미만이면 막는다', async () => {
        expect((await call({ text: '오늘 글쓰기 연습을 같이 해볼까요?' })).status).toBe(403)
        expect((await call({ text: '안녕하세요.' })).status).toBe(403)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('손님이 가져온 글은 옛 방식으로도 못 읽는다', async () => {
        expect((await call({ text: '손님이 심은 가짜 봇 답변입니다 아무 말이나 읽힙니다.' })).status).toBe(403)
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
            expect((await call({ text: '아무 글이나 길게 써서 보내 봅니다' })).status).toBe(410)
        } finally { vi.useRealTimers() }
    })
})
