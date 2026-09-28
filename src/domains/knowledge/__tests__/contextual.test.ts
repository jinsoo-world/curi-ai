import { describe, it, expect } from 'vitest'
import { splitIntoChunks, splitIntoChunksWithHeadings, headingOf, contextualEmbeddingText, sourceKindLabel } from '../embedding'

const doc = [
    '[슬라이드 2] 01 제안 배경', '글로벌 프리미엄 쿡웨어 시장 이야기 '.repeat(8),
    '[슬라이드 8] 07 재무 계획', '5개년 손익 전망과 매출 목표 '.repeat(10), '투자 구조 설명 '.repeat(12),
].join('\n\n')

describe('splitIntoChunksWithHeadings', () => {
    it('자르는 모양은 예전과 똑같다', () => {
        expect(splitIntoChunksWithHeadings(doc, 300).map(c => c.text)).toEqual(splitIntoChunks(doc, 300))
    })
    it('조각마다 가장 가까운 소제목이 붙는다', () => {
        const cs = splitIntoChunksWithHeadings(doc, 300)
        expect(cs[0].heading).toBe('01 제안 배경')
        const last = cs[cs.length - 1]
        expect(last.heading).toBe('07 재무 계획')
    })
})

describe('headingOf', () => {
    it('여러 소제목 모양', () => {
        expect(headingOf('# 가격 정책')).toBe('가격 정책')
        expect(headingOf('제3장 운영 계획')).toBe('제3장 운영 계획')
        expect(headingOf('\u2460 강연의 출발')).toBe('\u2460 강연의 출발')
        expect(headingOf('보통 문장입니다. 제목이 아니에요.')).toBeNull()
    })
})

describe('contextualEmbeddingText', () => {
    it('제목, 종류, 소제목을 머리말로 붙이고 원문은 그대로 뒤에', () => {
        const t = contextualEmbeddingText({ title: 'DOHL_사업계획서.pptx', sourceType: 'text', heading: '07 재무 계획' }, '매출 목표 30억')
        expect(t).toBe('[자료: DOHL_사업계획서.pptx / 종류: 슬라이드 / 부분: 07 재무 계획]\n\n매출 목표 30억')
        expect(t).not.toMatch(/[\u00B7\u2014]/)
    })
    it('끄면 원문 그대로', () => {
        expect(contextualEmbeddingText({ title: 'a' }, '원문', { CONTEXTUAL_CHUNKS_ENABLED: 'false' })).toBe('원문')
    })
    it('종류 이름', () => {
        expect(sourceKindLabel('pdf', 'x')).toBe('PDF')
        expect(sourceKindLabel('url', '어떤 글')).toBe('웹페이지')
        expect(sourceKindLabel('text', '안내문.hwp')).toBe('한글 문서')
    })
})
