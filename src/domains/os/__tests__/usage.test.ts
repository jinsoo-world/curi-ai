import { describe, it, expect } from 'vitest'
import { usageView, weekStartKST, weekResetKST, untilText, kstDayHourText, usageTone, ringLabel, usageDetail, USAGE_LIMIT_5H, USAGE_LIMIT_WEEK } from '../usage'

// 2026-09-23(수) 10:30 KST = 01:30 UTC
const now = new Date('2026-09-23T01:30:00Z')

describe('os/usage — 사용 한도 한 줄', () => {
    it('이번 주 시작은 서울 기준 월요일 0시(= 일요일 15시 UTC)', () => {
        expect(weekStartKST(now).toISOString()).toBe('2026-09-20T15:00:00.000Z')
        expect(weekResetKST(now).toISOString()).toBe('2026-09-27T15:00:00.000Z')
        expect(kstDayHourText(weekResetKST(now))).toBe('(월) 0시')
    })

    it('일요일 밤(KST) 도 같은 주로 센다', () => {
        const sunNight = new Date('2026-09-27T14:59:00Z') // 일 23:59 KST
        expect(weekStartKST(sunNight).toISOString()).toBe('2026-09-20T15:00:00.000Z')
    })

    it('퍼센트, 재설정 시각, 막힘 판정', () => {
        const v = usageView({ now, used5h: 12, oldest5h: new Date(now.getTime() - 48 * 60_000), usedWeek: 30, limit5h: 100, limitWeek: 1000 })
        expect(v.pct5h).toBe(12)
        expect(v.pctWeek).toBe(3)
        expect(v.resetAt5h?.toISOString()).toBe('2026-09-23T05:42:00.000Z')
        expect(v.blocked).toBe(false)
        expect(v.line).toBe('이번 주 사용 한도 3% / (월) 0시 초기화')
    })

    it('한도에 닿으면 blocked, 퍼센트는 100 을 넘지 않는다', () => {
        expect(usageView({ now, used5h: USAGE_LIMIT_5H, oldest5h: now, usedWeek: 0 }).blocked).toBe(false)   // 5시간 창 없음
        expect(usageView({ now, used5h: 0, oldest5h: null, usedWeek: USAGE_LIMIT_WEEK }).blocked).toBe(true)
        expect(usageView({ now, used5h: 0, oldest5h: null, usedWeek: USAGE_LIMIT_WEEK + 50 }).pctWeek).toBe(100)
    })

    it('아직 안 썼으면 0%', () => {
        expect(usageView({ now, used5h: 0, oldest5h: null, usedWeek: 0 }).line).toContain('0%')
    })

    it('남은 시간 글자', () => {
        expect(untilText(new Date(now.getTime() + 30_000), now)).toBe('곧')
        expect(untilText(new Date(now.getTime() + 25 * 60_000), now)).toBe('25분 후')
        expect(untilText(new Date(now.getTime() + 2 * 60 * 60_000), now)).toBe('2시간 후')
        expect(untilText(new Date(now.getTime() + 95 * 60_000), now)).toBe('1시간 35분 후')
    })
})

describe('os/usage — 원형 게이지·사용량 모달 글자', () => {
    const v = usageView({ now, used5h: 12, oldest5h: new Date(now.getTime() - 48 * 60_000), usedWeek: 30, limit5h: 100, limitWeek: 1000 })

    it('색 단계: 80 미만 ok, 80 이상 warn, 100 full', () => {
        expect(usageTone(0)).toBe('ok')
        expect(usageTone(79)).toBe('ok')
        expect(usageTone(80)).toBe('warn')
        expect(usageTone(99)).toBe('warn')
        expect(usageTone(100)).toBe('full')
    })

    it('원형 게이지 읽는 글자', () => {
        expect(ringLabel(12)).toBe('사용 한도 12%, 누르면 자세히')
    })

    it('모달 글자는 퍼센트만 보여 준다', () => {
        const d = usageDetail(v, now)
        expect(d.fiveHourText).toBe('12%')
        expect(d.fiveHourReset).toBe('4시간 12분 후 다시 채워져요')
        expect(d.weekText).toBe('3%')
        expect(d.weekReset).toBe('(월) 0시에 초기화')
        expect(d.blockedText).toBeNull()
    })

    it('JSON 으로 건너온 문자열 날짜도 그대로 읽는다', () => {
        const json = JSON.parse(JSON.stringify(v))
        expect(usageDetail(json, now).fiveHourReset).toBe('4시간 12분 후 다시 채워져요')
    })

    it('창이 비어 있으면 「아직 안 썼어요」', () => {
        const empty = usageView({ now, used5h: 0, oldest5h: null, usedWeek: 0 })
        expect(usageDetail(empty, now).fiveHourReset).toBe('아직 안 썼어요')
    })

    it('막히면 주간 초기화 요일·시각을 알려준다 (5시간 창 없음)', () => {
        const byWeek = usageView({ now, used5h: 0, oldest5h: null, usedWeek: USAGE_LIMIT_WEEK })
        expect(usageDetail(byWeek, now).blockedText).toBe('이번 주 한도에 닿았어요. (월) 0시에 다시 쓸 수 있어요')
    })
})
