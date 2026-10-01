// 「봇이 이렇게 이해했어요」 저장, 빼기도 봇 지시문을 바꾼다 = 공개 관문을 지난다 (최종 리뷰 1001)
import { describe, it, expect, vi, beforeEach } from 'vitest'

const applyBotEdit = vi.fn<(...a: unknown[]) => Promise<{ moderation?: unknown }>>(async () => ({}))
vi.mock('../publish-gate', () => ({ applyBotEdit: (...a: unknown[]) => applyBotEdit(...a) }))
vi.mock('@/domains/llm/side-text', () => ({ askSideText: vi.fn() }))

import { saveUnderstanding, dropUnderstanding, upsertUnderstandBlock } from '../understand'
import { tidyUnderstanding } from '../understand-shared'

beforeEach(() => applyBotEdit.mockClear())

/** 표마다 같은 값을 주는 가짜 DB. mentors 를 직접 update 하면 기록된다 */
function fakeDb(mentor: Record<string, unknown> | null) {
    const directMentorWrites: unknown[] = []
    const from = (table: string) => {
        const chain: Record<string, unknown> = {}
        for (const k of ['select', 'eq', 'order', 'limit']) chain[k] = () => chain
        chain.update = (row: unknown) => { if (table === 'mentors') directMentorWrites.push(row); return chain }
        const val = table === 'mentors' ? { data: mentor, error: null }
            : table === 'creator_profiles' ? { data: { id: 'cp1' }, error: null }
            : table === 'knowledge_sources' ? { data: { id: 's1', title: '강의 노트', source_type: 'text', content: '글', chunk_count: 1, processing_status: 'completed' }, error: null }
            : { data: null, error: null }
        chain.maybeSingle = async () => val
        chain.single = async () => val
        chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok)
        return chain
    }
    return { db: { from } as never, directMentorWrites }
}

describe('understand → 공개 관문', () => {
    it('saveUnderstanding: 지시문을 직접 쓰지 않고 관문에 system_prompt 로 넘긴다(내 크리에이터 번호로 묶음)', async () => {
        const { db, directMentorWrites } = fakeDb({ system_prompt: '기존 설명', creator_id: 'cp1' })
        const r = await saveUnderstanding(db, 'u1', 'm1', 's1', { topics: ['글쓰기'], tone: '다정함', facts: ['주 1회 강의'] })
        expect(r.savedToPrompt).toBe(true)
        expect(directMentorWrites).toHaveLength(0)
        const arg = applyBotEdit.mock.calls[0][1] as { mentorId: string; creatorId: string; actorUserId: string; fields: { system_prompt: string } }
        expect(arg).toMatchObject({ mentorId: 'm1', creatorId: 'cp1', actorUserId: 'u1' })
        expect(arg.fields.system_prompt).toContain('기존 설명')
        expect(Object.keys(arg.fields)).toEqual(['system_prompt'])
    })

    it('dropUnderstanding: 묶음이 있으면 관문으로 지운다, 없으면 아무것도 안 한다', async () => {
        const prompt = upsertUnderstandBlock('기존', 's1', '강의 노트', tidyUnderstanding({ topics: ['글쓰기'], tone: '다정함', facts: ['주 1회 강의'] }))
        const withBlock = fakeDb({ system_prompt: prompt, creator_id: 'cp1' })
        await dropUnderstanding(withBlock.db, 'm1', 's1', 'u1')
        expect(withBlock.directMentorWrites).toHaveLength(0)
        expect(applyBotEdit).toHaveBeenCalledTimes(1)
        expect((applyBotEdit.mock.calls[0][1] as { creatorId: string; fields: Record<string, unknown> })).toMatchObject({ creatorId: 'cp1', fields: { system_prompt: expect.any(String) } })

        applyBotEdit.mockClear()
        const none = fakeDb({ system_prompt: '묶음 없음', creator_id: 'cp1' })
        await dropUnderstanding(none.db, 'm1', 's1', 'u1')
        expect(applyBotEdit).not.toHaveBeenCalled()
    })
})
