import { describe, it, expect } from 'vitest'
import { detectSmallTalk, smallTalkPrompt } from '../small-talk'

describe('detectSmallTalk', () => {
    it.each([
        ['안녕하세요', 'greeting'], ['안녕하세요!', 'greeting'], ['안녕', 'greeting'], ['안녕~', 'greeting'], ['하이', 'greeting'], ['Hello', 'greeting'],
        ['ㅎㅇ', 'greeting'], ['반갑습니다', 'greeting'], ['안녕하세요 ^^', 'greeting'], ['좋은 아침이에요', 'greeting'],
        ['넌 누구야?', 'identity'], ['너 누구야', 'identity'], ['누구세요?', 'identity'], ['당신은 누구세요', 'identity'], ['이름이 뭐야?', 'identity'],
        ['자기소개 해줘', 'identity'], ['뭐 하는 봇이야?', 'identity'], ['너 AI야?', 'identity'], ['안녕하세요 넌 누구야', 'identity'], ['뭘 할 수 있어?', 'identity'],
        ['고마워요', 'thanks'], ['감사합니다!', 'thanks'], ['잘 가', 'bye'], ['안녕히 계세요', 'bye'],
    ])('%s → %s', (text, kind) => {
        expect(detectSmallTalk(text)).toBe(kind)
    })

    it.each([
        '', '   ', '환불 규정 알려주세요', '안녕하세요 환불 규정 알려주세요', '이 봇은 누가 만들었는지 자세히 알려주고 가격도 알려줘',
        '누구를 만나야 해요?', '서울 날씨', '오늘 뭐 먹지', '넌 누구야 그리고 내일 일정도 알려줘 가격도',
    ])('일반 질문은 잡지 않는다: %s', text => {
        expect(detectSmallTalk(text)).toBeNull()
    })

    it('안내 글은 거절 문구 금지와 지어내기 금지를 담는다', () => {
        const p = smallTalkPrompt('identity', { name: '진수봇', title: '나처럼 말하는 봇', description: '진수의 말투로 답해요' })
        expect(p).toContain('진수봇')
        expect(p).toContain('진수의 말투로 답해요')
        expect(p).toContain('거절 문구를 쓰지 말고')
        expect(p).toContain('만들어 내지 마라')
        expect(p).not.toMatch(/[·—–]/)
    })
})
