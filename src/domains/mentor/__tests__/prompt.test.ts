import { describe, it, expect } from 'vitest'
import { buildGeminiHistory, buildSystemPrompt } from '../prompt'

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

describe('buildGeminiHistory — 사진만 보낸 과거 메시지', () => {
    it('지난 턴에 사진만 보내 글이 비어 있어도 빈 글자를 그대로 넘기지 않는다', () => {
        // Gemini 는 빈 글자 part 를 거절한다. 사진만 보낸 메시지가 과거 기록이 되는
        // 다음 턴부터 그 대화방 전체가 실패하던 문제.
        const 결과 = buildGeminiHistory('안녕하세요!', [
            { role: 'user', content: '' },            // 지난 턴에 사진만 보냈다
            { role: 'assistant', content: '사진 잘 봤어요' },
            { role: 'user', content: '이게 뭐야?' },
        ])
        expect(결과[2]).toEqual({ role: 'user', parts: [{ text: '(사진)' }] })
        expect(결과[4]).toEqual({ role: 'user', parts: [{ text: '이게 뭐야?' }] })
    })

    it('AI 답변이 비어 있어도 빈 글자를 넘기지 않는다', () => {
        const 결과 = buildGeminiHistory('안녕하세요!', [
            { role: 'user', content: '안녕' },
            { role: 'assistant', content: '' },
        ])
        expect(결과[3]).toEqual({ role: 'model', parts: [{ text: '(내용 없음)' }] })
    })
})

describe('buildSystemPrompt — 봇 자기소개 (멘토 금지)', () => {
    const base = {
        system_prompt: '친절하게 답하세요.',
        greeting_message: '안녕!',
    }

    it('거절 문구에 「멘토」를 쓰지 않고 봇 이름을 쓴다', () => {
        const prompt = buildSystemPrompt({ ...base, name: '개발팀장' })
        expect(prompt).toContain('저는 개발팀장으로서 대화하는 게 제 역할이에요')
        expect(prompt).not.toContain('멘토로서')
        expect(prompt).not.toContain('저는 멘토')
    })

    it('이름 없으면 AI 봇으로서로 거절한다', () => {
        const prompt = buildSystemPrompt(base)
        expect(prompt).toContain('저는 AI 봇으로서 대화하는 게 제 역할이에요')
        expect(prompt).not.toContain('멘토로서')
    })

    it('주입 라벨에 멘토/멘티 대신 봇/사람을 쓴다', () => {
        const prompt = buildSystemPrompt({
            ...base,
            name: '글감봇',
            style_template: {
                examples: [{ mentee: '힘들어요', mentor: '천천히 가요' }],
            },
        })
        expect(prompt).toContain('[봇 스타일 가이드]')
        expect(prompt).toContain('사람: "힘들어요"')
        expect(prompt).toContain('봇: "천천히 가요"')
        expect(prompt).not.toContain('[멘토 스타일 가이드]')
        expect(prompt).not.toContain('멘티:')
        expect(prompt).not.toMatch(/멘토:/)
    })
})
