// 봇 정체 지키기 (2026-10-05): 「너 무슨 AI야」 에 「업스테이지 솔라 4입니다」 라고 답하던 문제
import { describe, it, expect } from 'vitest'
import { identityGuardPrompt, scrubModelNames } from '../identity'

describe('identityGuardPrompt', () => {
    it('봇 이름과 큐리AI 를 넣고, 모델과 회사 이름을 말하지 말라고 한다', () => {
        const p = identityGuardPrompt('열정진')
        expect(p).toContain('열정진')
        expect(p).toContain('큐리AI')
        for (const w of ['솔라', '업스테이지', '제미나이', 'GPT']) expect(p).toContain(w)
    })
    it('이름이 없어도 깨지지 않는다', () => {
        expect(identityGuardPrompt(null)).toContain('큐리AI')
    })
})

describe('scrubModelNames — 봇 자신의 모델 이름 가리기', () => {
    it.each([
        ['저는 업스테이지 솔라 4입니다', '저는 큐리AI입니다'],
        ['I am Solar Pro by Upstage', 'I am 큐리AI'],
        ['업스테이지의 솔라 프로 모델이에요', '큐리AI 모델이에요'],
        ['저는 솔라예요. 반가워요', '저는 큐리AI예요. 반가워요'],
        ['나는 구글 제미나이 기반이야', '나는 큐리AI 기반이야'],
        ["I'm GPT-4o.", "I'm 큐리AI."],
    ])('%s → %s', (input, want) => {
        expect(scrubModelNames(input)).toBe(want)
    })
    it.each([
        '오늘 솔라 패널을 설치했어요',
        '솔라(Solar) 패널은 비싸요',
        '솔라프로젝트에 참여했어요',
        '솔라 10장 설치했어요',
        '마마무 솔라예요',
        '챗GPT 쓰는 법: 질문을 입력하세요',
        '구글 제미나이로 요약해 보세요',
        'GPT-4o 는 오픈AI 가 만들었어요',
        '안녕하세요, 반가워요',
        '몇 년 전 GPT-3, GPT-4가 나왔고',
    ])('평범한 말은 그대로: %s', (input) => {
        expect(scrubModelNames(input)).toBe(input)
    })
})
