import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { matchKnowledge, keywordTerms, fuseRrf } from '../queries'

// 예전 벡터 검색(match_knowledge)만 답하는 가짜 DB. 하이브리드는 실패 → 예전 검색으로 되돌아가는지도 함께 본다
function makeDb(rows: { content: string; similarity: number }[]) {
    return {
        rpc: async (name: string) => name === 'match_knowledge'
            ? { data: rows, error: null }
            : { data: null, error: { message: 'no such function' } },
    } as unknown as SupabaseClient
}

type HRow = { content: string; similarity: number; vec_rank: number | null; kw_rank: number | null }
function makeHybridDb(rows: HRow[], calls: { name: string; args: Record<string, unknown> }[] = []) {
    return {
        rpc: async (name: string, args: Record<string, unknown>) => {
            calls.push({ name, args })
            return name === 'match_knowledge_hybrid' ? { data: rows, error: null } : { data: [], error: null }
        },
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

describe('keywordTerms, 한국어 낱말 뽑기', () => {
    it('조사를 떼고 흔한 말은 버린다', () => {
        expect(keywordTerms('중장년 창업자를 위한 교육은 뭐야?')).toEqual(['중장년', '창업자', '위한', '교육'])
        expect(keywordTerms('DOHL 매출 목표가 얼마야?')).toEqual(['dohl', '매출', '목표', '얼마야'])
    })
    it('두 글자 줄기는 남긴다 (창업을 → 창업)', () => {
        expect(keywordTerms('창업을')).toEqual(['창업'])
    })
    it('빈 말은 빈 배열', () => {
        expect(keywordTerms('   ?? ')).toEqual([])
    })
})

describe('fuseRrf', () => {
    it('두 목록 모두 1등이면 1, 한쪽만 1등이면 0.5', () => {
        expect(fuseRrf({ vec_rank: 1, kw_rank: 1 })).toBeCloseTo(1)
        expect(fuseRrf({ vec_rank: 1, kw_rank: null })).toBeCloseTo(0.5)
    })
})

describe('matchKnowledge 하이브리드', () => {
    it('낱말로도 걸린 조각을 앞세우고, similarity 는 진짜 벡터 값 그대로', async () => {
        const db = makeHybridDb([
            { content: '벡터만 1등', similarity: 0.80, vec_rank: 1, kw_rank: null },
            { content: '벡터 2등 + 낱말 1등', similarity: 0.78, vec_rank: 2, kw_rank: 1 },
        ])
        const rows = await matchKnowledge(db, [0.1], 'm1', 0.7, 2, 'DOHL 매출', { hybrid: true })
        expect(rows[0].content).toBe('벡터 2등 + 낱말 1등')
        expect(rows[0].similarity).toBe(0.78)
    })
    it('낱말로만 걸렸어도 벡터 유사도가 너무 낮으면 버린다', async () => {
        const db = makeHybridDb([
            { content: '낱말만, 엉뚱', similarity: 0.40, vec_rank: null, kw_rank: 1 },
            { content: '낱말만, 비슷', similarity: 0.60, vec_rank: null, kw_rank: 2 },
        ])
        const rows = await matchKnowledge(db, [0.1], 'm1', 0.7, 5, '매출 목표', { hybrid: true })
        expect(rows.map(r => r.content)).toEqual(['낱말만, 비슷'])
    })
    it('mentor_id 를 그대로 넘긴다 (격리)', async () => {
        const calls: { name: string; args: Record<string, unknown> }[] = []
        await matchKnowledge(makeHybridDb([], calls), [0.1], 'm-owner', 0.7, 5, '매출 목표', { hybrid: true })
        expect(calls[0].name).toBe('match_knowledge_hybrid')
        expect(calls[0].args.match_mentor_id).toBe('m-owner')
    })
    it('끄면 예전 벡터 검색만 부른다', async () => {
        const calls: { name: string; args: Record<string, unknown> }[] = []
        await matchKnowledge(makeHybridDb([], calls), [0.1], 'm1', 0.7, 5, '매출 목표', { hybrid: false })
        expect(calls.map(c => c.name)).toEqual(['match_knowledge'])
    })
    it('Q&A 가산점은 하이브리드에서도 산다', async () => {
        const db = makeHybridDb([
            { content: '보통 글', similarity: 0.80, vec_rank: 1, kw_rank: 2 },
            { content: '질문: 환불 어떻게 하나요\n답: 마이페이지', similarity: 0.78, vec_rank: 2, kw_rank: 1 },
        ])
        const rows = await matchKnowledge(db, [0.1], 'm1', 0.7, 2, '환불 하고 싶어요', { hybrid: true })
        expect(rows[0].content).toContain('환불 어떻게')
    })
})
