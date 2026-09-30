import { describe, it, expect } from 'vitest'
import {
    CLOVER_OVERAGE_ENABLED, CLOVER_COST, chatCloverCost, cloverBalanceNote, packAnswerHint, readCloverAuto, fillCopy, USAGE_COPY, REFUND_NOTICE, PLAN_REASON,
    OVERAGE_COPY, overageStep, MONTHLY_LIMITS, overageSheetNote, cloverSpentText,
} from '../usage-config'
import { usageView } from '../usage'

describe('usage-config: 클로버 이어 쓰기 스위치 (대표 승인 0928 23:53 켬)', () => {
    it('스위치가 켜져 있고, 켜진 동작이 같이 켜진다', () => {
        expect(CLOVER_OVERAGE_ENABLED).toBe(true)
        expect(chatCloverCost()).toBe(5)
        expect(chatCloverCost({ photo: true })).toBe(15)
        expect(packAnswerHint(2000)).toBe('')           // 횟수 표기 금지 (대표 지시 0929)
        expect(cloverBalanceNote()).toBe('이번 달 한도 안에서는 클로버를 쓰지 않아요')
        expect(readCloverAuto({ getItem: () => '1' })).toBe(true)
        expect(readCloverAuto({ getItem: () => null })).toBe(false)
        expect(OVERAGE_COPY.confirm).toBe('이번 달 사용량을 모두 쓰셨어요. 이어서 쓰시면 클로버가 쓰여요.')
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
        expect(fillCopy(USAGE_COPY.remaining, 0)).toBe('이번 달 사용량 0%')
        expect(fillCopy(USAGE_COPY.caption, 0)).toBe('이번 달 0% 사용')
        // 고객 화면 문구에 횟수 표기가 없다
        for (const v of [...Object.values(USAGE_COPY), OVERAGE_COPY.confirm]) expect(v).not.toMatch(/\{n\}번|\d+번|회\)|남은/)
        expect(fillCopy(USAGE_COPY.warnCard, 82)).toBe('이번 달 사용량이 82%예요')
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

describe('고객 화면 횟수 표기 없음 (대표 지시 0929): /os/charge', () => {
    const COUNT = /\d[\d,]*\s*(번|회)/
    it('요금제 카드 혜택에 답변 횟수가 없다 (한도 숫자는 코드 설정값에만)', async () => {
        const { PLANS } = await import('../plan')
        for (const p of PLANS) {
            for (const perk of p.perks) expect(perk).not.toMatch(COUNT)
            expect(p.perks.some(x => x.includes('답변'))).toBe(false)
        }
        expect(PLANS.map(p => p.perks[1])).toEqual(['가볍게 써 보기', '넉넉하게 쓰기', '가장 넉넉하게 쓰기'])
        expect(PLANS.map(p => p.limitMonth)).toEqual([30, 370, 1250])
    })
    it('결제 화면 코드에 횟수 문구와 묶음 횟수 표기가 없다', async () => {
        const { readFileSync } = await import('node:fs')
        const src = readFileSync('src/app/os/charge/page.tsx', 'utf8')
        expect(src).not.toMatch(COUNT)
        expect(src).not.toContain('packAnswerHint')
        expect(src).not.toContain('remaining')
    })
})

describe('클로버 이어 쓰기 창과 답 아래 표시 (0930 대표 「매번 승인 번거로워, 클로버 주는 게 보이면 좋겠어」)', () => {
    it('창에 한 번에 쓰는 클로버와 남은 클로버를 보여 준다 (원화 환산 없음)', () => {
        expect(overageSheetNote(1240, 5, 15)).toBe('답 하나에 클로버 5개(사진이 있으면 15개)가 쓰여요. 지금 1240개 남았어요.')
        expect(overageSheetNote(null, 5, 5)).toBe('답 하나에 클로버 5개가 쓰여요.')
        expect(overageSheetNote(1240, 5)).not.toMatch(/원/)
    })
    it('답 아래 한 줄', () => {
        expect(cloverSpentText(5, 1235)).toBe('🍀 클로버 5개 씀, 1235개 남음')
        expect(cloverSpentText(5, null)).toBe('🍀 클로버 5개 씀')
    })
    it('이어 쓰기 창 문구: 이번 대화 동안 다시 묻지 않고, 앞으로도 안 묻게 고를 수 있다', () => {
        expect(OVERAGE_COPY.continueBtn).toContain('클로버로 이어 쓰기')
        expect(OVERAGE_COPY.sessionNote).toContain('이 대화에서는 다시 묻지 않아요')
        expect(OVERAGE_COPY.alwaysLabel).toContain('앞으로도 묻지 않기')
    })
})
