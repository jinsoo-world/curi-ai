import { describe, it, expect } from 'vitest'
import { buildCheckinSummary, cleanDid, todaySeoul, DID_CHIPS, MOOD_LABELS, ENERGY_LABELS } from '../checkin'

describe('os/checkin — 칩 목록', () => {
    it('오늘 한 일 칩 6개, 기분·에너지 5칸씩', () => {
        expect(DID_CHIPS).toHaveLength(6)
        expect(MOOD_LABELS).toHaveLength(5)
        expect(ENERGY_LABELS).toHaveLength(5)
    })

    it('모르는 칩은 버리고, 중복은 한 번만, 최대 6개', () => {
        expect(cleanDid(['강의', '강의', '글', '해킹시도'])).toEqual(['강의', '글'])
        expect(cleanDid('강의' as unknown as string[])).toEqual([])
    })
})

describe('os/checkin — 기억에 남길 한 줄', () => {
    it('기분·에너지·한 일·막힌 일이 한 줄로 들어간다', () => {
        const s = buildCheckinSummary({ mood: 4, energy: 2, did: ['강의', '영상'], blocked: '편집이 안 끝났다' }, '2026-09-26')
        expect(s).toContain('2026-09-26')
        expect(s).toContain('기분 4/5')
        expect(s).toContain('에너지 2/5')
        expect(s).toContain('강의, 영상')
        expect(s).toContain('편집이 안 끝났다')
    })

    it('안 고른 칸은 아예 적지 않는다 (빈칸을 지어내지 않는다)', () => {
        const s = buildCheckinSummary({ mood: null, energy: 3, did: [], blocked: null }, '2026-09-26')
        expect(s).toContain('에너지 3/5')
        expect(s).not.toContain('기분')
        expect(s).not.toContain('한 일')
        expect(s).not.toContain('막힌 일')
    })

    it('아무것도 안 골라도 한 줄은 남는다', () => {
        const s = buildCheckinSummary({ mood: null, energy: null, did: [], blocked: null }, '2026-09-26')
        expect(s).toContain('2026-09-26')
        expect(s.length).toBeGreaterThan(0)
    })

    it('막힌 일이 길면 자른다 (기억은 한 줄이다)', () => {
        const s = buildCheckinSummary({ mood: 3, energy: 3, did: [], blocked: '가'.repeat(300) }, '2026-09-26')
        expect(s.length).toBeLessThan(260)
    })
})

describe('os/checkin — 한국 오늘', () => {
    it('한국 달력 날짜를 YYYY-MM-DD 로 준다', () => {
        expect(todaySeoul(new Date('2026-09-25T15:00:00Z'))).toBe('2026-09-26')
        expect(todaySeoul(new Date('2026-09-25T14:59:00Z'))).toBe('2026-09-25')
    })
})
