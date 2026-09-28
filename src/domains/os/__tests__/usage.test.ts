import { describe, it, expect } from 'vitest'
import {
    usageView, weekStartKST, weekResetKST, monthStartKST, monthResetKST, usageCountFrom, untilText, kstDayHourText, kstDateHourText,
    usageTone, ringLabel, usageDetail, isUsageLike, limitReachedMessage, remainingText, USAGE_LIMIT_MONTH,
} from '../usage'
import { MONTHLY_LIMITS, USAGE_WARN_PCT } from '../usage-config'

// 2026-09-23(수) 10:30 KST = 01:30 UTC
const now = new Date('2026-09-23T01:30:00Z')

describe('os/usage: 주 경계 (봇 주인 방문자 캡, 주간 보고용으로 남김)', () => {
    it('이번 주 시작은 서울 기준 월요일 0시', () => {
        expect(weekStartKST(now).toISOString()).toBe('2026-09-20T15:00:00.000Z')
        expect(weekResetKST(now).toISOString()).toBe('2026-09-27T15:00:00.000Z')
        expect(kstDayHourText(weekResetKST(now))).toBe('(월) 0시')
    })
})

describe('os/usage: 월간 한도 (대표 결정 0928)', () => {
    it('기본 한도: 무료 30, 베이직 370, 프로 1,250', () => {
        expect(MONTHLY_LIMITS).toEqual({ free: 30, basic: 370, pro: 1250 })
        expect(USAGE_LIMIT_MONTH).toBe(30)
    })

    it('이번 달 시작과 다시 채워지는 때는 서울 기준 1일 0시', () => {
        expect(monthStartKST(now).toISOString()).toBe('2026-08-31T15:00:00.000Z')
        expect(monthResetKST(now).toISOString()).toBe('2026-09-30T15:00:00.000Z')
        expect(kstDateHourText(monthResetKST(now))).toBe('10월 1일 0시')
        // 서울 10월 1일 0시 직후는 10월
        const oct = new Date('2026-09-30T15:00:01Z')
        expect(monthStartKST(oct).toISOString()).toBe('2026-09-30T15:00:00.000Z')
        // 12월 다음은 이듬해 1월
        expect(monthResetKST(new Date('2026-12-15T00:00:00Z')).toISOString()).toBe('2026-12-31T15:00:00.000Z')
    })

    it('월간으로 바꾼 시점 전 대화는 세지 않는다', () => {
        const since = '2026-09-28T15:00:00Z'
        expect(usageCountFrom(new Date('2026-09-29T03:00:00Z'), since).toISOString()).toBe('2026-09-28T15:00:00.000Z')
        expect(usageCountFrom(new Date('2026-10-05T03:00:00Z'), since).toISOString()).toBe('2026-09-30T15:00:00.000Z')
        expect(usageCountFrom(now, 'bad').toISOString()).toBe('2026-08-31T15:00:00.000Z')
    })

    it('퍼센트, 남은 수, 막힘, 알림', () => {
        const v = usageView({ now, used: 12, limit: 30, plan: 'free' })
        expect(v.pct).toBe(40)
        expect(v.remaining).toBe(18)
        expect(v.blocked).toBe(false)
        expect(v.warn).toBe(false)
        expect(v.line).toBe('이번 달 사용 한도 40% / 10월 1일 0시 초기화')
        const w = usageView({ now, used: 24, limit: 30 })
        expect(w.pct).toBe(USAGE_WARN_PCT)
        expect(w.warn).toBe(true)
        const full = usageView({ now, used: 45, limit: 30 })
        expect(full.blocked).toBe(true)
        expect(full.warn).toBe(false)
        expect(full.pct).toBe(100)
        expect(full.remaining).toBe(0)
    })

    it('요금제 한도를 쓴다', () => {
        expect(usageView({ now, used: 300, limit: MONTHLY_LIMITS.basic, plan: 'basic' }).blocked).toBe(false)
        expect(usageView({ now, used: 300, limit: MONTHLY_LIMITS.basic, plan: 'basic' }).plan).toBe('basic')
    })

    it('남은 시간 글자', () => {
        expect(untilText(new Date(now.getTime() + 30_000), now)).toBe('곧')
        expect(untilText(new Date(now.getTime() + 95 * 60_000), now)).toBe('1시간 35분 후')
    })

    it('한도 도달 말', () => {
        expect(limitReachedMessage(monthResetKST(now))).toBe('이번 달 사용 한도에 닿았어요. 10월 1일 0시에 다시 채워져요. 더 쓰려면 요금제를 올려 보세요.')
    })
})

describe('os/usage: 원형 게이지와 사용량 모달 글자', () => {
    const v = usageView({ now, used: 12, limit: 30 })

    it('색 단계: 80 미만 ok, 80 이상 warn, 100 full', () => {
        expect(usageTone(79)).toBe('ok')
        expect(usageTone(80)).toBe('warn')
        expect(usageTone(100)).toBe('full')
    })

    it('원형 게이지 읽는 글자', () => {
        expect(ringLabel(12)).toBe('사용 한도 12%, 누르면 자세히')
    })

    it('모달 첫 줄은 퍼센트 (횟수는 안 보임)', () => {
        const d = usageDetail(v, now)
        expect(d.remainingText).toBe('이번 달 사용량 40%')
        expect(remainingText({ pct: 0 })).toBe('이번 달 사용량 0%')
        expect(d.pctText).toBe('40%')
        expect(d.resetText).toBe('10월 1일 0시에 초기화')
        expect(d.blockedText).toBeNull()
    })

    it('JSON 으로 건너온 문자열 날짜도 읽고, 옛 모양은 거른다', () => {
        const json = JSON.parse(JSON.stringify(v))
        expect(isUsageLike(json)).toBe(true)
        expect(usageDetail(json, now).resetText).toBe('10월 1일 0시에 초기화')
        expect(isUsageLike({ pctWeek: 3, limitWeek: 100 })).toBe(false)
        expect(isUsageLike({ guest: true })).toBe(false)
    })

    it('막히면 다시 채워지는 날을 알려준다', () => {
        const full = usageView({ now, used: 30, limit: 30 })
        expect(usageDetail(full, now).blockedText).toBe('이번 달 한도에 닿았어요. 10월 1일 0시에 다시 쓸 수 있어요')
    })
})
