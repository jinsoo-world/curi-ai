// PATCH /api/os/team/[id] — 앱 「내 봇 고치기」의 지시문 저장. 30,000자까지 그대로, 넘으면 400(예전엔 12,000자에서 조용히 잘랐다)
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

describe('PATCH /api/os/team/[id] systemPrompt', () => {
    it('30,000자는 한 글자도 안 잘리고 저장으로 넘어간다', async () => {
        const r = await patch({ systemPrompt: '가'.repeat(30_000) })
        expect(r.status).toBe(200)
        expect((calls[0].patch.systemPrompt as string).length).toBe(30_000)
    })
    it('예전 한도 12,000자를 넘는 지시문도 잘리지 않는다', async () => {
        const text = '가'.repeat(12_000) + '끝'
        await patch({ systemPrompt: text })
        expect(calls[0].patch.systemPrompt).toBe(text)
    })
    it('30,001자는 400 + 문구, 같이 보낸 다른 칸도 안 쓴다', async () => {
        const r = await patch({ systemPrompt: '가'.repeat(30_001), name: '새이름' })
        expect(r.status).toBe(400)
        expect(r.body.error).toBe('지시문은 30,000자까지 쓸 수 있어요')
        expect(calls).toHaveLength(0)
    })
})
