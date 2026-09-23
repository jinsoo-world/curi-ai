import { describe, expect, it } from 'vitest'
import { splitMentionSegments } from '../mention-chips'

const bots = [
    { mentorId: '1', name: '창조성회복코치 미니린', avatarUrl: null },
    { mentorId: '2', name: '미니린', avatarUrl: null },
    { mentorId: '3', name: '도여사', shape: 'circle', color: 'white', avatarUrl: '/a.png' },
]

describe('splitMentionSegments', () => {
    it('@긴 이름을 짧은 이름보다 먼저 칩으로 잡는다', () => {
        const parts = splitMentionSegments('@창조성회복코치 미니린 안녕', bots)
        expect(parts[0]).toMatchObject({ kind: 'mention', bot: { mentorId: '1' } })
        expect(parts[1]).toMatchObject({ kind: 'text', text: ' 안녕' })
    })

    it('전달 표식을 칩으로 나눈다', () => {
        const parts = splitMentionSegments('[도여사가 전달] 님 안녕하세요', bots)
        expect(parts[0]).toMatchObject({ kind: 'handoff', label: '도여사가' })
        expect(parts.some(p => p.kind === 'text' && p.text.includes('안녕하세요'))).toBe(true)
    })

    it('멘션이 없으면 텍스트 한 조각', () => {
        expect(splitMentionSegments('그냥 인사', bots)).toEqual([{ kind: 'text', text: '그냥 인사' }])
    })
})
