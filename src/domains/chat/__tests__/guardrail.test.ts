import { describe, it, expect } from 'vitest'
import { detectCrisisKeywords, CRISIS_RESPONSE, ERROR_MESSAGES } from '../guardrail'

describe('chat/guardrail', () => {
    describe('detectCrisisKeywords', () => {
        it.each([
            '죽고싶어',
            '죽고 싶어',
            '자살하고 싶다',
            '자해를 하고 싶어',
            '살고싶지않아',
            '살고 싶지 않아',
            '세상을 떠나고 싶어',
            '목숨을 끊고 싶다',
            '더이상 못살겠어',
            '더 이상 못 살겠어',
            '유서를 남기고',
        ])('위험 메시지 감지: "%s"', (message) => {
            expect(detectCrisisKeywords(message)).toBe(true)
        })

        it.each([
            '오늘 날씨 좋다',
            '죽이는 맛이야',
            '취업 어떻게 해야할까요',
            '멘토님 안녕하세요',
            '이직을 고민중이에요',
        ])('안전 메시지 통과: "%s"', (message) => {
            expect(detectCrisisKeywords(message)).toBe(false)
        })

        // "자살골" 같은 단어는 "자살"을 포함하므로 감지됨 — 안전 > 정확도 트레이드오프
        it('자살골 = 오탐이지만 안전 우선으로 감지됨', () => {
            expect(detectCrisisKeywords('자살골 넣었어')).toBe(true)
        })

        it('공백 무시하고 감지', () => {
            expect(detectCrisisKeywords('죽 고 싶 어')).toBe(true)
        })
    })

    describe('CRISIS_RESPONSE', () => {
        it('1393 번호 포함', () => {
            expect(CRISIS_RESPONSE).toContain('1393')
        })

        it('1577-0199 번호 포함', () => {
            expect(CRISIS_RESPONSE).toContain('1577-0199')
        })
    })

    describe('ERROR_MESSAGES', () => {
        it('무료 대화 2회 이하 시 안내 메시지', () => {
            const msg = ERROR_MESSAGES.freeUsageExhausted(2)
            expect(msg).toContain('2회')
        })

        it('무료 대화 3회 이상 시 빈 문자열', () => {
            expect(ERROR_MESSAGES.freeUsageExhausted(5)).toBe('')
        })

        it('무료 대화 소진 시 구독 안내', () => {
            expect(ERROR_MESSAGES.freeUsageDone).toContain('프리미엄')
        })
    })
})
