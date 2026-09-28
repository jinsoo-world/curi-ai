import { describe, it, expect } from 'vitest'
import {
    CLOVER_OVERAGE_ENABLED, CLOVER_COST, chatCloverCost, cloverBalanceNote, packAnswerHint, readCloverAuto, fillCopy, USAGE_COPY, REFUND_NOTICE, PLAN_REASON,
    OVERAGE_COPY, overageStep, MONTHLY_LIMITS,
} from '../usage-config'
import { usageView } from '../usage'

describe('usage-config: 클로버 이어 쓰기 스위치 (대표 승인 0928 23:53 켬)', () => {
    it('스위치가 켜져 있고, 켜진 동작이 같이 켜진다', () => {
        expect(CLOVER_OVERAGE_ENABLED).toBe(true)
        expect(chatCloverCost()).toBe(5)
        expect(chatCloverCost({ photo: true })).toBe(15)
        expect(packAnswerHint(2000)).toBe('(텍스트 답변 약 400회)')
        expect(cloverBalanceNote()).toBe('이번 달 한도 안에서는 클로버를 쓰지 않아요')
        expect(readCloverAuto({ getItem: () => '1' })).toBe(true)
        expect(readCloverAuto({ getItem: () => null })).toBe(false)
        expect(fillCopy(OVERAGE_COPY.confirm, chatCloverCost())).toBe('이번 달 답변을 모두 쓰셨어요. 이어서 쓰시면 답변 1회에 클로버 5개가 쓰여요(사진을 붙이면 15개).')
    })

    it('순서: 월 한도를 먼저 쓰고, 다 쓴 뒤에만 클로버', () => {
        const now = new Date('2026-10-15T03:00:00Z')
        const at = (used: number) => usageView({ now, used, limit: MONTHLY_LIMITS.free, plan: 'free' })
        // 29번째까지는 한도 안 = 클로버 안 씀 (이어 쓰기를 골라 둔 사람도)
        expect(overageStep({ blocked: at(29).blocked, cloverOk: true })).toBe('free')
        expect(overageStep({ blocked: at(29).blocked })).toBe('free')
        // 30번을 다 쓰면 먼저 묻고, 고른 요청에서만 뺀다
        expect(overageStep({ blocked: at(30).blocked })).toBe('ask')
        expect(overageStep({ blocked: at(30).blocked, cloverOk: 'yes' })).toBe('ask')
        expect(overageStep({ blocked: at(30).blocked, cloverOk: true })).toBe('charge')
        // 스위치를 끄면 옛 동작 (막기만)
        expect(overageStep({ blocked: true, cloverOk: true }, false)).toBe('block')
        expect(overageStep({ blocked: false, cloverOk: true }, false)).toBe('free')
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
