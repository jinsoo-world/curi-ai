import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { matchKnowledge } from '../queries'

function makeDb(rows: { content: string; similarity: number }[]) {
    return {
        rpc: async () => ({ data: rows, error: null }),
    } as unknown as SupabaseClient
}

describe('matchKnowledge — Q&A 조각은 검색 시 가중치를 더 받는다', () => {
    it('질문이 겹치는 Q&A 조각을 유사도가 더 높은 일반 글보다 앞세울 수 있다', async () => {
        const db = makeDb([
            { content: '보통 글 조각, 환불과는 상관없는 내용', similarity: 0.82 },
            { content: '질문: 환불 어떻게 하나요\n답: 마이페이지에서 신청하면 됩니다', similarity: 0.79 },
        ])
        const rows = await matchKnowledge(db, [0.1], 'm1', 0.5, 2, '환불 하고 싶어요')
        expect(rows[0].content).toContain('환불 어떻게 하나요')
    })

    it('Q&A 가 아닌 조각들은 유사도 순서를 그대로 지킨다', async () => {
        const db = makeDb([
            { content: '조각 A', similarity: 0.9 },
            { content: '조각 B', similarity: 0.7 },
        ])
        const rows = await matchKnowledge(db, [0.1], 'm1', 0.5, 2)
        expect(rows.map(r => r.content)).toEqual(['조각 A', '조각 B'])
    })

    it('queryText 를 안 줘도 Q&A 조각은 기본 가산점만큼 살짝 앞선다', async () => {
        const db = makeDb([
            { content: '일반 글 조각', similarity: 0.80 },
            { content: '질문: 아무 질문\n답: 아무 답', similarity: 0.80 },
        ])
        const rows = await matchKnowledge(db, [0.1], 'm1', 0.5, 2)
        expect(rows[0].content).toContain('질문:')
    })

    it('mentorId 없이 부르면 예외(교차 계정 방지)', async () => {
        const db = makeDb([])
        await expect(matchKnowledge(db, [0.1], '')).rejects.toThrow()
    })
})
