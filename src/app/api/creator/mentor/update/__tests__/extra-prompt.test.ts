// PATCH /api/creator/mentor/update — 웹 리더 편집의 추가 프롬프트 저장
// 주인만(requireMentorOwner), 5,000자 넘으면 400, 저장은 공개 관문(applyBotEdit)으로 = 공개 중이면 다시 AI 확인
import { describe, it, expect, vi, beforeEach } from 'vitest'

const edits: Record<string, unknown>[] = []
let ownerOk = true
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/mentor-owner', () => ({
    requireMentorOwner: async () => ownerOk
        ? { ok: true, admin: {}, userId: 'u1', mentor: { creator_id: 'c1' } }
        : { ok: false, status: 403, error: '내 AI 가 아니에요' },
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

beforeEach(() => { edits.length = 0; ownerOk = true })

describe('웹 리더 편집 extraPrompt', () => {
    it('저장 칸 extra_prompt 로 넘긴다(다듬어서), 비우면 null', async () => {
        await call({ mentorId: 'm1', extraPrompt: ' 말투 예시 ' })
        await call({ mentorId: 'm1', extraPrompt: '' })
        expect(edits.map(e => e.extra_prompt)).toEqual(['말투 예시', null])
    })
    it('5,001자는 400, 아무것도 안 쓴다', async () => {
        const r = await call({ mentorId: 'm1', extraPrompt: '가'.repeat(5001), name: 'x' })
        expect(r.status).toBe(400)
        expect(edits).toHaveLength(0)
    })
    it('주인이 아니면 403 (길이 검사보다 먼저 막힌다)', async () => {
        ownerOk = false
        const r = await call({ mentorId: 'm1', extraPrompt: '가'.repeat(5001) })
        expect(r.status).toBe(403)
        expect(edits).toHaveLength(0)
    })
})
