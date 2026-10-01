// 옛 /creator 공개 길도 같은 관문을 지난다 (2차 리뷰 CRITICAL). 관문, 로그인, DB 는 가짜.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const applyBotEdit = vi.fn<(...a: unknown[]) => Promise<{ moderation?: { verdict: string; reasons: string[]; categories: string[] } }>>()
const recheckAfterKnowledge = vi.fn<(...a: unknown[]) => Promise<void>>(async () => {})
vi.mock('@/domains/os/publish-gate', () => ({
    applyBotEdit: (...a: unknown[]) => applyBotEdit(...a),
    recheckAfterKnowledge: (...a: unknown[]) => recheckAfterKnowledge(...a),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: () => unknown) => { void fn() } }))

const inserts: Record<string, unknown>[] = []
function fakeDb() {
    const chain: Record<string, unknown> = {}
    for (const k of ['select', 'eq', 'update', 'neq', 'order']) chain[k] = () => chain
    chain.insert = (row: Record<string, unknown>) => { inserts.push(row); return chain }
    chain.single = async () => ({ data: { id: 'm1' }, error: null })
    chain.maybeSingle = async () => ({ data: { id: 'cp1' }, error: null })
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], count: 1, error: null }).then(ok)
    return { from: () => chain } as never
}
vi.mock('@/lib/mentor-owner', () => ({
    requireMentorOwner: vi.fn(async () => ({ ok: true, userId: 'u1', userEmail: '', creatorId: 'cp1', isAdmin: false, mentor: { id: 'm1', creator_id: 'cp1', mentor_type: 'creator' }, admin: fakeDb() })),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.c', user_metadata: {} } } }) } }) }))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeDb() }))

import { PATCH as updatePatch } from '@/app/api/creator/mentor/update/route'
import { POST as mentorPost } from '@/app/api/creator/mentor/route'
import { createMentorDraft } from '@/domains/creator'
import { requireMentorOwner } from '@/lib/mentor-owner'

beforeEach(() => { applyBotEdit.mockReset(); recheckAfterKnowledge.mockClear(); inserts.length = 0 })

const req = (url: string, method: string, body: unknown) => new Request(url, { method, body: JSON.stringify(body) }) as never
const verdict = (v: string, reasons: string[] = ['이유']) => ({ moderation: { verdict: v, reasons, categories: ['c'] } })

describe('/api/creator/mentor/update — 배포 켜기, 고치기', () => {
    it('isActive 를 직접 쓰지 않고 관문으로 보낸다(wantPublic). 막힘 = 422', async () => {
        applyBotEdit.mockResolvedValue(verdict('block', ['유명인 흉내']))
        const res = await updatePatch(req('http://x', 'PATCH', { mentorId: 'm1', isActive: true }))
        expect(res.status).toBe(422)
        expect(await res.json()).toMatchObject({ code: 'MODERATION_BLOCKED', reasons: ['유명인 흉내'] })
        const arg = applyBotEdit.mock.calls[0][1] as { wantPublic: boolean; fields: Record<string, unknown>; creatorId: string }
        expect(arg.wantPublic).toBe(true)
        expect(arg.creatorId).toBe('cp1')
        expect(arg.fields).not.toHaveProperty('is_active')
        expect(arg.fields).not.toHaveProperty('status')
    })

    it('확인 필요 = 202', async () => {
        applyBotEdit.mockResolvedValue(verdict('review'))
        const res = await updatePatch(req('http://x', 'PATCH', { mentorId: 'm1', systemPrompt: '새 지시문', isActive: true }))
        expect(res.status).toBe(202)
        expect(await res.json()).toMatchObject({ code: 'MODERATION_REVIEW' })
        expect((applyBotEdit.mock.calls[0][1] as { fields: Record<string, unknown> }).fields).toMatchObject({ system_prompt: '새 지시문' })
    })

    it('지시문만 고쳐도(배포 칸 없이) 관문을 지난다 = 공개 중이면 다시 확인', async () => {
        applyBotEdit.mockResolvedValue({})
        const res = await updatePatch(req('http://x', 'PATCH', { mentorId: 'm1', greetingMessage: '새 인사', sampleQuestions: ['q'] }))
        expect(res.status).toBe(200)
        const arg = applyBotEdit.mock.calls[0][1] as { wantPublic?: boolean; fields: Record<string, unknown> }
        expect(arg.wantPublic).toBeUndefined()
        expect(arg.fields).toMatchObject({ greeting_message: '새 인사', sample_questions: ['q'] })
    })
})

describe('/api/creator/mentor step publish — 옛 만들기 마지막 단계', () => {
    it('publishMentor 도 관문으로 간다. 막힘 = 422', async () => {
        applyBotEdit.mockResolvedValue(verdict('block'))
        const res = await mentorPost(req('http://x', 'POST', { step: 'publish', mentorId: 'm1', isPublic: true }))
        expect(res.status).toBe(422)
        expect((applyBotEdit.mock.calls[0][1] as { wantPublic: boolean }).wantPublic).toBe(true)
    })

    it('확인 필요 = 202', async () => {
        applyBotEdit.mockResolvedValue(verdict('review'))
        const res = await mentorPost(req('http://x', 'POST', { step: 'publish', mentorId: 'm1', isPublic: true }))
        expect(res.status).toBe(202)
    })

    it('2단계(지시문, 인사말)도 관문으로 가고 내 크리에이터 번호로 묶는다', async () => {
        applyBotEdit.mockResolvedValue({})
        await mentorPost(req('http://x', 'POST', { step: 2, mentorId: 'm1', systemPrompt: '지시문', greetingMessage: '안녕', sampleQuestions: [] }))
        const arg = applyBotEdit.mock.calls[0][1] as { creatorId: string; fields: Record<string, unknown> }
        expect(arg.creatorId).toBe('cp1')
        expect(arg.fields).toMatchObject({ system_prompt: '지시문', greeting_message: '안녕' })
    })

    it('3단계(자료)를 넣으면 공개 중인 봇을 다시 확인하게 한다', async () => {
        await mentorPost(req('http://x', 'POST', { step: 3, mentorId: 'm1', knowledgeText: '자료 글' }))
        expect(recheckAfterKnowledge).toHaveBeenCalledWith(expect.anything(), { mentorId: 'm1', actorUserId: 'u1' })
    })
})

describe('/api/creator/mentor step 3 — 주인 확인', () => {
    it('내 AI 가 아니면 403, 자료를 넣지도 다시 확인하지도 않는다', async () => {
        vi.mocked(requireMentorOwner).mockResolvedValueOnce({ ok: false, error: '권한이 없습니다.', status: 403 })
        const res = await mentorPost(req('http://x', 'POST', { step: 3, mentorId: 'someone-else', knowledgeText: '남의 봇에 심는 글' }))
        expect(res.status).toBe(403)
        expect(inserts).toHaveLength(0)
        expect(recheckAfterKnowledge).not.toHaveBeenCalled()
        expect(requireMentorOwner).toHaveBeenCalledWith('someone-else')
    })
})

describe('createMentorDraft', () => {
    it('초안은 비공개로 만든다 (DB 기본값에 기대지 않는다)', async () => {
        await createMentorDraft(fakeDb(), 'cp1', { name: 'n', title: 't', description: '', expertise: [], avatarUrl: '' })
        expect(inserts[0]).toMatchObject({ is_active: false })
    })
})
