import { describe, it, expect } from 'vitest'
import { usageView, weekStartKST, weekResetKST, untilText, kstDayHourText, USAGE_LIMIT_5H, USAGE_LIMIT_WEEK } from '../usage'

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
        const v = usageView({ now, used5h: 12, oldest5h: new Date(now.getTime() - 48 * 60_000), usedWeek: 30 })
        expect(v.pct5h).toBe(12)
        expect(v.pctWeek).toBe(3)
        expect(v.resetAt5h?.toISOString()).toBe('2026-09-23T05:42:00.000Z')
        expect(v.blocked).toBe(false)
        expect(v.line).toBe('사용 한도 12% / 4시간 12분 후 재설정 / 주간 3% / (월) 0시 초기화')
    })

    it('한도에 닿으면 blocked, 퍼센트는 100 을 넘지 않는다', () => {
        expect(usageView({ now, used5h: USAGE_LIMIT_5H, oldest5h: now, usedWeek: 0 }).blocked).toBe(true)
        expect(usageView({ now, used5h: 0, oldest5h: null, usedWeek: USAGE_LIMIT_WEEK + 50 }).pctWeek).toBe(100)
    })

    it('창이 비어 있으면 「아직 안 씀」', () => {
        expect(usageView({ now, used5h: 0, oldest5h: null, usedWeek: 0 }).line).toContain('아직 안 씀')
    })

    it('남은 시간 글자', () => {
        expect(untilText(new Date(now.getTime() + 30_000), now)).toBe('곧')
        expect(untilText(new Date(now.getTime() + 25 * 60_000), now)).toBe('25분 후')
        expect(untilText(new Date(now.getTime() + 2 * 60 * 60_000), now)).toBe('2시간 후')
        expect(untilText(new Date(now.getTime() + 95 * 60_000), now)).toBe('1시간 35분 후')
    })
})
