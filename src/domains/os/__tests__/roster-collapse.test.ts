import { describe, it, expect } from 'vitest'
import {
    collapseRoster, toggleLabel, readRosterExpanded, writeRosterExpanded, ROSTER_EXPANDED_KEY,
} from '../roster-collapse'

const bots = (n: number) => Array.from({ length: n }, (_, i) => `b${i + 1}`)

describe('collapseRoster: 봇이 많으면 앞 6명 + 더 보기', () => {
    it('6명 이하면 다 보이고 단추가 없다', () => {
        expect(collapseRoster(bots(4), { expanded: false, searching: false })).toEqual({ shown: bots(4), hiddenCount: 0, showToggle: false })
        expect(collapseRoster(bots(6), { expanded: false, searching: false }).showToggle).toBe(false)
    })

    it('7명 이상이고 접혀 있으면 앞 6명만, 나머지 수를 센다', () => {
        const r = collapseRoster(bots(9), { expanded: false, searching: false })
        expect(r.shown).toEqual(bots(6))
        expect(r.hiddenCount).toBe(3)
        expect(r.showToggle).toBe(true)
        expect(toggleLabel(false, r.hiddenCount)).toBe('더 보기 (+3)')
    })

    it('펴면 전부 보이고 단추는 접기가 된다', () => {
        const r = collapseRoster(bots(9), { expanded: true, searching: false })
        expect(r.shown).toEqual(bots(9))
        expect(r.showToggle).toBe(true)
        expect(toggleLabel(true, r.hiddenCount)).toBe('접기')
    })

    it('고른 봇이 6명 밖이면 접혀 있어도 6번째 자리에 보인다', () => {
        const r = collapseRoster(bots(9), { expanded: false, searching: false, isCurrent: b => b === 'b8' })
        expect(r.shown).toEqual(['b1', 'b2', 'b3', 'b4', 'b5', 'b8'])
        expect(r.hiddenCount).toBe(3)
    })

    it('고른 봇이 앞 6명 안이면 그대로다', () => {
        const r = collapseRoster(bots(9), { expanded: false, searching: false, isCurrent: b => b === 'b2' })
        expect(r.shown).toEqual(bots(6))
    })

    it('검색 중이면 접기와 상관없이 맞는 봇을 다 보이고 단추를 숨긴다', () => {
        const r = collapseRoster(bots(9), { expanded: false, searching: true })
        expect(r).toEqual({ shown: bots(9), hiddenCount: 0, showToggle: false })
    })

    it('문구에 가운뎃점, 긴 줄표가 없다', () => {
        for (const s of [toggleLabel(false, 5), toggleLabel(true, 0)]) expect(s).not.toMatch(/[·—]/)
    })
})

describe('편 상태 세션 기억', () => {
    it('쓰고 다시 읽는다', () => {
        const m = new Map<string, string>()
        const store = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) } }
        expect(readRosterExpanded(store)).toBe(false)
        writeRosterExpanded(store, true)
        expect(m.get(ROSTER_EXPANDED_KEY)).toBe('1')
        expect(readRosterExpanded(store)).toBe(true)
        writeRosterExpanded(store, false)
        expect(readRosterExpanded(store)).toBe(false)
    })

    it('저장소가 없거나 터져도 죽지 않는다', () => {
        const bad = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } }
        expect(readRosterExpanded(bad)).toBe(false)
        expect(() => writeRosterExpanded(bad, true)).not.toThrow()
        expect(readRosterExpanded(null)).toBe(false)
    })
})
