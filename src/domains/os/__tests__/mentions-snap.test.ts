import { describe, expect, it } from 'vitest'
import { mentionTokenRanges, snapCursorAroundMentions } from '../mentions'

describe('snapCursorAroundMentions', () => {
    const names = ['창조성회복코치 미니린', '기획팀장']

    it('토큰 밖이면 그대로', () => {
        const t = '@기획팀장 님 안녕하세요'
        expect(snapCursorAroundMentions(t, 0, names)).toBe(0)
        expect(snapCursorAroundMentions(t, t.length, names)).toBe(t.length)
        expect(snapCursorAroundMentions(t, 6, names)).toBe(6) // after @기획팀장
    })

    it('토큰 한가운데면 가까운 끝으로', () => {
        const t = '@기획팀장 안녕'
        // @기획팀장 = 0..5 ( @ + 4 chars = 5? 기획팀장 is 4 chars, @ = 1 → end 5)
        const ranges = mentionTokenRanges(t, names)
        expect(ranges[0]).toEqual({ start: 0, end: 5 })
        expect(snapCursorAroundMentions(t, 2, names)).toBe(0)
        expect(snapCursorAroundMentions(t, 4, names)).toBe(5)
    })

    it('긴 이름 토큰도 잡는다', () => {
        const t = '@창조성회복코치 미니린 님'
        const ranges = mentionTokenRanges(t, names)
        expect(ranges.length).toBe(1)
        expect(ranges[0].start).toBe(0)
        const mid = Math.floor(ranges[0].end / 2)
        const snapped = snapCursorAroundMentions(t, mid, names)
        expect(snapped === 0 || snapped === ranges[0].end).toBe(true)
    })
})
