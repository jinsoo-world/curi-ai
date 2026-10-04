// 「답 못 한 질문」 기록 (대표 승인 1005): 답에 모른다는 말이 있으면 conversation_signals 에 남기고, 실패해도 던지지 않는다.
import { describe, it, expect, vi } from 'vitest'
import { maskPersonalInfo, recordTopicGap } from '../signals'

function fakeDb(result: { error?: unknown; throws?: boolean } = {}) {
    const rows: Record<string, unknown>[] = []
    const db = {
        from: (table: string) => ({
            insert: async (row: Record<string, unknown>) => {
                if (result.throws) throw new Error('boom')
                rows.push({ table, ...row })
                return { error: result.error ?? null }
            },
        }),
    }
    return { db: db as never, rows }
}

describe('maskPersonalInfo', () => {
    it('이메일과 전화번호를 가린다', () => {
        expect(maskPersonalInfo('메일은 a.b@test.co.kr 번호는 010-1234-5678 입니다')).toBe('메일은 [이메일] 번호는 [번호] 입니다')
    })
})

describe('recordTopicGap', () => {
    it('답에 「잘 모르겠」이 있으면 topic_gap 한 줄을 남긴다 (질문은 가려서)', async () => {
        const { db, rows } = fakeDb()
        await recordTopicGap(db, { sessionId: 's1', mentorId: 'm1', userId: 'u1', question: '010-1234-5678 환불 어떻게 해요?', answer: '자료에 없어서 잘 모르겠어요.' })
        expect(rows).toHaveLength(1)
        expect(rows[0].table).toBe('conversation_signals')
        expect(rows[0].signal_type).toBe('topic_gap')
        expect(rows[0].session_id).toBe('s1')
        expect((rows[0].signal_data as Record<string, string>).user_question).toBe('[번호] 환불 어떻게 해요?')
    })
    it('모른다는 말이 없으면 아무것도 안 남긴다', async () => {
        const { db, rows } = fakeDb()
        await recordTopicGap(db, { mentorId: 'm1', userId: 'u1', question: '안녕', answer: '안녕하세요! 반가워요.' })
        expect(rows).toHaveLength(0)
    })
    it('forced 면 말투와 상관없이 남긴다 (모델을 안 부른 자료 없음 답), 대화방과 회원이 없어도 된다', async () => {
        const { db, rows } = fakeDb()
        await recordTopicGap(db, { sessionId: null, mentorId: 'm1', userId: null, question: '질문', answer: '리더가 정한 문구', forced: true })
        expect(rows).toHaveLength(1)
        expect(rows[0].session_id).toBeNull()
        expect(rows[0].user_id).toBeNull()
    })
    it('DB가 던지거나 오류를 줘도 던지지 않는다 (대화에 영향 없음)', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {})
        await expect(recordTopicGap(fakeDb({ throws: true }).db, { mentorId: 'm', question: 'q', answer: '잘 모르겠어요' })).resolves.toBeUndefined()
        await expect(recordTopicGap(fakeDb({ error: { code: '23503' } }).db, { mentorId: 'm', question: 'q', answer: '잘 모르겠어요' })).resolves.toBeUndefined()
        err.mockRestore()
    })
})

describe('대화 경로 연결 (코드 모양)', () => {
    it('/api/chat 이 응답 뒤에 기다리지 않고 부른다', async () => {
        const { readFileSync } = await import('node:fs')
        const src = readFileSync('src/app/api/chat/route.ts', 'utf8')
        expect(src).toContain("import { recordTopicGap } from '@/domains/chat/signals'")
        expect(src.match(/keepAliveAfterResponse\(recordTopicGap\(/g)?.length).toBe(2)
        expect(src).not.toMatch(/await recordTopicGap/)
    })
})
