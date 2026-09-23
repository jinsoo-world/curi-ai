import { describe, it, expect } from 'vitest'
import { findMentionedBot, canBotSpeakAgain, MAX_BOT_TURNS, MAX_MEMBERS, pickResponders, botWorkingLabel, MAX_FANOUT_BOTS } from '../channels'

const 멤버 = [
    { mentorId: 'm1', name: '비서실장' },
    { mentorId: 'm2', name: '글감봇' },
    { mentorId: 'm3', name: '요약봇' },
]

describe('findMentionedBot — 봇이 다른 봇을 부르는 규칙', () => {
    it('@이름 이 있으면 그 봇을 고른다', () => {
        expect(findMentionedBot('이건 @글감봇 이 더 잘 알아요', 멤버, 'm1')).toEqual({ mentorId: 'm2', name: '글감봇' })
    })

    it('@ 가 없으면 아무도 안 부른다', () => {
        expect(findMentionedBot('제가 정리했습니다', 멤버, 'm1')).toBeNull()
    })

    it('방에 없는 이름은 무시한다', () => {
        expect(findMentionedBot('@없는봇 알려줘', 멤버, 'm1')).toBeNull()
    })

    it('자기 자신은 다시 못 부른다 (혼자 끝없이 도는 것 막기)', () => {
        expect(findMentionedBot('@비서실장 제가 더 볼게요', 멤버, 'm1')).toBeNull()
    })

    it('여러 명을 불러도 먼저 나온 한 명만 답한다 (봇 떼답장 막기)', () => {
        expect(findMentionedBot('@요약봇 하고 @글감봇 같이 봐요', 멤버, 'm1')).toEqual({ mentorId: 'm3', name: '요약봇' })
    })

    it('말하는 봇을 안 알려줘도 동작한다', () => {
        expect(findMentionedBot('@비서실장 어때요', 멤버)).toEqual({ mentorId: 'm1', name: '비서실장' })
    })

    it('빈 말·이름 없는 멤버는 넘어간다', () => {
        expect(findMentionedBot('', 멤버, 'm1')).toBeNull()
        expect(findMentionedBot('@', [{ mentorId: 'mx', name: '' }])).toBeNull()
    })
})

describe('canBotSpeakAgain — 한 번 물으면 봇은 최대 두 번만 말한다', () => {
    it('0번·1번 말했으면 더 말해도 된다', () => {
        expect(canBotSpeakAgain(0)).toBe(true)
        expect(canBotSpeakAgain(1)).toBe(true)
    })
    it('2번 말했으면 멈춘다', () => {
        expect(canBotSpeakAgain(2)).toBe(false)
        expect(canBotSpeakAgain(5)).toBe(false)
    })
    it('상한은 2다', () => {
        expect(MAX_BOT_TURNS).toBe(2)
    })
})

describe('방 크기', () => {
    it('한 방 멤버 상한이 정해져 있다', () => {
        expect(MAX_MEMBERS).toBeGreaterThan(1)
        expect(MAX_MEMBERS).toBeLessThanOrEqual(10)
    })
})

describe('봇이 끝없이 서로 답하지 않는다 (안티패턴 ㉟)', () => {
    it('서로를 계속 불러도 두 번째 봇에서 멈춘다', () => {
        // 첫 봇이 @글감봇 을 부르고, 글감봇이 다시 @요약봇 을 불러도 세 번째는 없다.
        const 이름들 = 멤버
        let 차례: string | null = 'm1'
        let 말한횟수 = 0
        const 말한봇: string[] = []
        const 대사: Record<string, string> = {
            m1: '이건 @글감봇 이 더 잘 알아요',
            m2: '저보다 @요약봇 이 낫겠어요',
            m3: '그럼 @비서실장 께 넘길게요',
        }
        while (차례 && canBotSpeakAgain(말한횟수)) {
            말한봇.push(차례)
            말한횟수 += 1
            const 지목 = findMentionedBot(대사[차례], 이름들, 차례)
            차례 = 지목 && canBotSpeakAgain(말한횟수) ? 지목.mentorId : null
        }
        expect(말한봇).toEqual(['m1', 'm2'])
        expect(말한횟수).toBe(MAX_BOT_TURNS)
    })
})


describe('pickResponders — 방 전체 vs @한 명', () => {
    it('@가 있으면 그 봇만 고른다', () => {
        expect(pickResponders('이건 @글감봇 몫이에요', 멤버)).toEqual([{ mentorId: 'm2', name: '글감봇' }])
    })

    it('@가 없으면 멤버 순서대로 상한까지 고른다', () => {
        expect(pickResponders('다들 의견 줘요', 멤버)).toEqual(멤버)
    })

    it('멤버가 상한보다 많으면 자른다', () => {
        const many = [
            ...멤버,
            { mentorId: 'm4', name: '디자인봇' },
            { mentorId: 'm5', name: '데이터봇' },
        ]
        expect(pickResponders('전체 회의', many)).toHaveLength(MAX_FANOUT_BOTS)
        expect(pickResponders('전체 회의', many).map(x => x.mentorId)).toEqual(['m1', 'm2', 'm3', 'm4'])
    })

    it('멤버가 없으면 빈 배열', () => {
        expect(pickResponders('안녕하세요', [])).toEqual([])
    })
})

describe('botWorkingLabel — 작업 중 표지', () => {
    it('이름 뒤에 작업 중… 을 붙인다', () => {
        expect(botWorkingLabel('글감봇')).toBe('글감봇 작업 중…')
    })
    it('빈 이름은 봇 으로 부른다', () => {
        expect(botWorkingLabel('')).toBe('봇 작업 중…')
        expect(botWorkingLabel('   ')).toBe('봇 작업 중…')
    })
    it('가운뎃점이나 긴 줄표를 쓰지 않는다', () => {
        const s = botWorkingLabel('컨텐츠봇')
        expect(s).not.toMatch(/[·—]/)
    })
})
