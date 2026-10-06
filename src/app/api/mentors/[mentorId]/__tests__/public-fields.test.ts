// GET /api/mentors/{id} — 손님, 남, 주인에게 각각 무엇이 나가는가
// 봇 지시문(system_prompt)과 말투 틀(persona_template, style_template)은 주인에게만 나간다.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const OWNER = '11111111-1111-4111-8111-111111111111'
const STRANGER = '22222222-2222-4222-8222-222222222222'
const CREATOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const BOT = '9fc9b3fa-1721-40c6-bc4e-1b544c117483'

const ROW = {
    id: BOT, name: '테스트봇', slug: 'test-bot', title: '제목', description: '설명',
    avatar_url: null, expertise: ['a'], personality_traits: ['따뜻한'],
    system_prompt: '비밀 지시문 819자', extra_prompt: '비밀 추가 프롬프트 자주 받는 질문', greeting_message: '안녕', sample_questions: ['q1'],
    voice_id: 'voice-abc', is_premium: false, is_active: true, sort_order: 1,
    created_at: '2026-10-01T00:00:00Z', style_template: { tone: 'x' }, creator_id: CREATOR,
    mentor_type: 'general', status: 'active', persona_template: 'mentor', price: 0,
    subscriber_count: 3, updated_at: '2026-10-02T00:00:00Z', category: null, organization: null,
    handle: null, voice_sample_url: 'https://x/v.mp3', voice_test_url: null,
    pdf_export_enabled: true, links: [], chat_theme_color: '#03C124',
}

const state: { user: { id: string } | null } = { user: null }

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}))
vi.mock('@/domains/mentor', async (orig) => {
    const real = await orig<typeof import('@/domains/mentor')>()
    return { ...real, getMentorById: async () => ({ ...ROW }), getPublicMentorById: async () => null }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/domains/os/knowledge', () => {
    class BotNotMine extends Error {}
    return {
        BotNotMine,
        assertBotOwned: async (_db: unknown, userId: string) => { if (userId !== OWNER) throw new BotNotMine() },
    }
})

import { GET } from '../route'

const call = async () => {
    const res = await GET(new Request(`http://x/api/mentors/${BOT}`) as never, { params: Promise.resolve({ mentorId: BOT }) })
    return { status: res.status, body: await res.json() as { mentor: Record<string, unknown> } }
}

const SECRET = ['system_prompt', 'persona_template', 'style_template', 'personality_traits', 'extra_prompt']

beforeEach(() => { state.user = null })

describe('GET /api/mentors/{id} 공개 필드', () => {
    it('손님(로그인 없음)에게는 지시문이 안 나간다', async () => {
        const { status, body } = await call()
        expect(status).toBe(200)
        for (const k of SECRET) expect(body.mentor).not.toHaveProperty(k)
        expect(JSON.stringify(body)).not.toContain('비밀 지시문')
        expect(JSON.stringify(body)).not.toContain('비밀 추가 프롬프트')
        // 화면이 쓰는 칸은 남아 있다
        expect(body.mentor).toMatchObject({
            id: BOT, name: '테스트봇', slug: 'test-bot', greeting_message: '안녕', sample_questions: ['q1'],
            voice_sample_url: 'https://x/v.mp3', pdf_export_enabled: true, chat_theme_color: '#03C124', creator_id: CREATOR,
        })
    })

    it('남(로그인했지만 주인 아님)에게도 지시문이 안 나간다', async () => {
        state.user = { id: STRANGER }
        const { body } = await call()
        for (const k of SECRET) expect(body.mentor).not.toHaveProperty(k)
        expect(JSON.stringify(body)).not.toContain('비밀 지시문')
    })

    it('주인에게는 전체가 나간다(앱 봇 고치기 틀이 지시문을 읽는다)', async () => {
        state.user = { id: OWNER }
        const { body } = await call()
        expect(body.mentor.system_prompt).toBe('비밀 지시문 819자')
        expect(body.mentor.persona_template).toBe('mentor')
        expect(body.mentor.extra_prompt).toBe('비밀 추가 프롬프트 자주 받는 질문')
    })
})
