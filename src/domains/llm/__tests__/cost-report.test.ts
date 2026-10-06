import { describe, it, expect } from 'vitest'
import { buildCostReport, kstRanges, parseBudget } from '../cost-report'

describe('AI 비용 매일 보고', () => {
    it('서울 기준 어제 0시~오늘 0시, 이번 달 1일', () => {
        const r = kstRanges(new Date('2026-10-06T00:05:00Z'))   // 서울 10/6 09:05
        expect(r.dayFrom.toISOString()).toBe('2026-10-04T15:00:00.000Z')
        expect(r.dayTo.toISOString()).toBe('2026-10-05T15:00:00.000Z')
        expect(r.monthFrom.toISOString()).toBe('2026-09-30T15:00:00.000Z')
        expect(r.dayLabel).toBe('10/5')
    })

    it('회사별·손님/무료/유료별 어제·이번 달 합계, 예산이 있으면 % 와 분모', () => {
        const day = [
            { provider: 'gemini', segment: 'free', calls: 10, cost_krw: 1000 },
            { provider: 'upstage', segment: 'guest', calls: 5, cost_krw: 500 },
        ]
        const month = [...day, { provider: 'gemini', segment: 'paid', calls: 100, cost_krw: 48500 }]
        const text = buildCostReport({ day, month, dayLabel: '10/5', budgetKrw: 100000 })
        expect(text).toContain('어제(10/5) 1,500원')
        expect(text).toContain('이번 달 50,000원')
        expect(text).toContain('월 예산 100,000원 중 50.0%')
        expect(text).toContain('gemini: 1,000원 / 49,500원')
        expect(text).toContain('손님: 500원 / 500원')
        expect(text).toContain('유료: 0원 / 48,500원')
        expect(text).not.toContain('—')
    })

    it('예산 환경변수가 없거나 이상하면 % 를 안 적는다', () => {
        expect(parseBudget(undefined)).toBeNull()
        expect(parseBudget('abc')).toBeNull()
        expect(parseBudget('500,000')).toBe(500000)
        expect(buildCostReport({ day: [], month: [], dayLabel: '10/5', budgetKrw: null })).not.toContain('%')
    })
})
