// PATCH /api/creator/mentor/update — 웹 리더 편집의 지시문 저장. 30,000자까지, 넘으면 400(예전엔 한도가 없었다)
import { describe, it, expect, vi, beforeEach } from 'vitest'

const edits: Record<string, unknown>[] = []
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/mentor-owner', () => ({
    requireMentorOwner: async () => ({ ok: true, admin: {}, userId: 'u1', mentor: { creator_id: 'c1' } }),
}))
vi.mock('@/domains/os/publish-gate', () => ({
    BotHeld: class extends Error {},
    applyBotEdit: async (_db: unknown, a: { fields: Record<string, unknown> }) => { edits.push(a.fields); return {} },
}))

import { PATCH } from '../route'

const call = async (body: unknown) => {
    const res = await PATCH(new Request('http://x/api/creator/mentor/update', { method: 'PATCH', body: JSON.stringify(body) }) as never)
    return { status: res.status, body: await res.json() as Record<string, unknown> }
}

beforeEach(() => { edits.length = 0 })

describe('웹 리더 편집 systemPrompt', () => {
    it('30,000자는 그대로 저장', async () => {
        const r = await call({ mentorId: 'm1', systemPrompt: '가'.repeat(30_000) })
        expect(r.status).toBe(200)
        expect((edits[0].system_prompt as string).length).toBe(30_000)
    })
    it('30,001자는 400 + 문구, 아무것도 안 쓴다', async () => {
        const r = await call({ mentorId: 'm1', systemPrompt: '가'.repeat(30_001), name: 'x' })
        expect(r.status).toBe(400)
        expect(r.body.error).toBe('지시문은 30,000자까지 쓸 수 있어요')
        expect(edits).toHaveLength(0)
    })
})
