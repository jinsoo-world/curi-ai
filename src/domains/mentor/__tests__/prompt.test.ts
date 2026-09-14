import { describe, it, expect } from 'vitest'
import { buildGeminiHistory } from '../prompt'

describe('buildGeminiHistory — 사진 첨부', () => {
    const 인사말 = '안녕하세요!'
    const 대화 = [
        { role: 'user', content: '안녕' },
        { role: 'assistant', content: '반가워요' },
        { role: 'user', content: '이 사진 좀 봐줘' },
    ]

    it('사진이 없으면 글만 담는다 (기존 동작 그대로)', () => {
        const 결과 = buildGeminiHistory(인사말, 대화)
        expect(결과).toHaveLength(5)
        expect(결과[4]).toEqual({ role: 'user', parts: [{ text: '이 사진 좀 봐줘' }] })
    })

    it('사진이 있으면 마지막 사용자 말에 사진을 함께 붙인다', () => {
        const 결과 = buildGeminiHistory(인사말, 대화, {
            mimeType: 'image/jpeg',
            data: 'AAAA',
        })
        expect(결과[4]).toEqual({
            role: 'user',
            parts: [
                { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } },
                { text: '이 사진 좀 봐줘' },
            ],
        })
    })

    it('사진만 보내고 글이 비어 있어도 빈 글자는 넣지 않는다', () => {
        const 결과 = buildGeminiHistory(인사말, [{ role: 'user', content: '' }], {
            mimeType: 'image/png',
            data: 'BBBB',
        })
        expect(결과[2]).toEqual({
            role: 'user',
            parts: [{ inlineData: { mimeType: 'image/png', data: 'BBBB' } }],
        })
    })

    it('사진은 마지막 한 통에만 붙는다 (앞선 사용자 말은 글만)', () => {
        const 결과 = buildGeminiHistory(인사말, 대화, {
            mimeType: 'image/jpeg',
            data: 'AAAA',
        })
        expect(결과[2]).toEqual({ role: 'user', parts: [{ text: '안녕' }] })
    })

    it('마지막이 AI 말이면 사진을 붙이지 않는다 (있을 수 없는 상황 방어)', () => {
        const 결과 = buildGeminiHistory(인사말, [
            { role: 'user', content: '안녕' },
            { role: 'assistant', content: '반가워요' },
        ], { mimeType: 'image/jpeg', data: 'AAAA' })
        expect(결과[3]).toEqual({ role: 'model', parts: [{ text: '반가워요' }] })
    })
})
