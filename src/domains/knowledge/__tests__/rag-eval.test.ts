import { describe, it, expect } from 'vitest'
import { retrievalHit, answerCheck, inventedNumbers, summarize, validateFixture, type GoldenFixture, type GoldenItem } from '../rag-eval'

const price: GoldenItem = { id: 'p1', mentorId: 'm', type: 'price', question: '수강료 얼마예요?', expectAny: ['30,000원'], keyFacts: ['30,000원'] }
const notin: GoldenItem = { id: 'n1', mentorId: 'm', type: 'notin', question: '비트코인 전망?', expectAny: [] }

describe('rag-eval 채점', () => {
    it('위 5개 안에 있으면 맞힘, 6번째면 못 맞힘', () => {
        const other = { content: '다른 이야기', similarity: 0.8 }
        expect(retrievalHit(price, [other, { content: '수강료는 30,000 원 입니다', similarity: 0.8 }])).toBe(true)
        expect(retrievalHit(price, [other, other, other, other, other, { content: '30,000원', similarity: 0.9 }])).toBe(false)
    })
    it('자료에 없음: 가까운 조각이 없으면 맞힘', () => {
        expect(retrievalHit(notin, [])).toBe(true)
        expect(retrievalHit(notin, [{ content: 'x', similarity: 0.72 }])).toBe(true)
        expect(retrievalHit(notin, [{ content: 'x', similarity: 0.9 }])).toBe(false)
    })
    it('지어낸 숫자를 잡는다', () => {
        expect(inventedNumbers('30,000원이고 50,000원 할인', ['수강료 30000원'])).toEqual(['50,000'])
    })
    it('답 검사: 사실 있음/지어냄/모른다고 함', () => {
        expect(answerCheck(price, '30,000원이에요', ['30,000원']).ok).toBe(true)
        expect(answerCheck(price, '25,000원이에요', ['30,000원']).ok).toBe(false)
        expect(answerCheck(notin, '자료에 없어서 잘 모르겠어요', []).ok).toBe(true)
        expect(answerCheck(notin, '오를 거예요', []).ok).toBe(false)
    })
    it('합계와 기준(기본 32)', () => {
        const f: GoldenFixture = { version: 1, items: [] }
        const rs = Array.from({ length: 40 }, (_, i) => ({ id: String(i), type: 'fact' as const, hit: i < 31 }))
        expect(summarize(f, rs)).toMatchObject({ hits: 31, total: 40, threshold: 32, pass: false })
        expect(summarize({ ...f, threshold: 30 }, rs).pass).toBe(true)
    })
    it('문제 파일에 전화·메일이 있으면 막는다', () => {
        expect(validateFixture({ version: 1, items: [price, notin] })).toEqual([])
        expect(validateFixture({ version: 1, items: [{ ...price, expectAny: ['010-1234-5678'] }] })).toHaveLength(1)
    })
})
