import { describe, it, expect } from 'vitest'
import {
    CLOVER_OVERAGE_ENABLED, CLOVER_COST, chatCloverCost, cloverBalanceNote, packAnswerHint, readCloverAuto, fillCopy, USAGE_COPY, REFUND_NOTICE, PLAN_REASON,
} from '../usage-config'

describe('usage-config: 클로버 이어 쓰기 스위치 (대표 확인 전 꺼짐)', () => {
    it('스위치는 꺼져 있고, 꺼진 동안은 옛 동작 그대로', () => {
        expect(CLOVER_OVERAGE_ENABLED).toBe(false)
        expect(chatCloverCost()).toBe(100)            // 옛 상수 그대로 (지금 어디서도 빼지 않음)
        expect(packAnswerHint(2000)).toBe('')         // 묶음 옆 횟수 표기 없음
        expect(cloverBalanceNote()).toBe('대화는 클로버를 쓰지 않아요')
        expect(readCloverAuto({ getItem: () => '1' })).toBe(false)
    })

    it('rev5 소모표', () => {
        expect(CLOVER_COST).toEqual({ text: 5, voice: 10, cloneVoice: 15, photoAnswer: 15, knowledgePage: 6, imageGen: 20 })
    })
})

describe('usage-config: 문구', () => {
    it('구멍 채우기', () => {
        expect(fillCopy(USAGE_COPY.remaining, 1250)).toBe('이번 달 남은 1,250번')
        expect(fillCopy(USAGE_COPY.warnCard, 6)).toBe('이번 달 한도가 6번 남았어요')
    })
    it('청약철회 안내와 필수 확인이 들어 있다. 가운데점, 긴 대시 없음', () => {
        for (const v of [REFUND_NOTICE.plan, REFUND_NOTICE.clover, REFUND_NOTICE.agree, ...Object.values(USAGE_COPY)]) {
            expect(v).not.toMatch(/[·—–]/)
        }
        expect(REFUND_NOTICE.agree.startsWith('[필수]')).toBe(true)
    })
    it('요금제 한 줄 이유는 대표 결정 전이라 비어 있다', () => {
        expect(Object.values(PLAN_REASON).every(v => v === '')).toBe(true)
    })
})
