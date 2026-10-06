// PATCH /api/os/team/[id] — 앱 「내 봇 고치기」의 추가 프롬프트 저장
// 5,000자 넘으면 400(아무것도 안 쓴다), 비우면 null(지움), 주인 확인·관리자 열쇠·AI 공개 확인은 updateTeamBot 이 한다
import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: { patch: Record<string, unknown> }[] = []
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/domains/os', () => ({
    SHAPES: ['circle'], COLORS: ['green'],
    updateTeamBot: async (_db: unknown, _u: string, _id: string, patch: Record<string, unknown>) => { calls.push({ patch }); return {} },
    removeTeamBot: async () => {},
}))
vi.mock('@/domains/os/look-change', () => ({ classifyLookChange: () => null, postLookChangeBeat: async () => null }))

import { PATCH } from '../route'

const patch = async (body: unknown) => {
    const res = await PATCH(new Request('http://x/api/os/team/t1', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 't1' }) })
    return { status: res.status, body: await res.json() as Record<string, unknown> }
}

beforeEach(() => { calls.length = 0 })

describe('PATCH /api/os/team/[id] extraPrompt', () => {
    it('글이면 다듬어서 저장으로 넘긴다', async () => {
        const r = await patch({ extraPrompt: '  자주 받는 질문: 환불은 7일 안  ' })
        expect(r.status).toBe(200)
        expect(calls[0].patch.extraPrompt).toBe('자주 받는 질문: 환불은 7일 안')
    })
    it('빈 글·null 은 지움(null)', async () => {
        await patch({ extraPrompt: '' })
        await patch({ extraPrompt: null })
        expect(calls.map(c => c.patch.extraPrompt)).toEqual([null, null])
    })
    it('5,000자는 받고 5,001자는 400 — 같이 보낸 다른 칸도 안 쓴다', async () => {
        expect((await patch({ extraPrompt: '가'.repeat(5000) })).status).toBe(200)
        calls.length = 0
        const r = await patch({ extraPrompt: '가'.repeat(5001), name: '새이름' })
        expect(r.status).toBe(400)
        expect(String(r.body.error)).toContain('5,000')
        expect(calls).toHaveLength(0)
    })
    it('안 보내면 건드리지 않는다', async () => {
        await patch({ name: '봇' })
        expect(calls[0].patch).not.toHaveProperty('extraPrompt')
    })
})
