import { describe, it, expect } from 'vitest'
import { findMentionedBot, canBotSpeakAgain, MAX_BOT_TURNS, MAX_MEMBERS } from '../channels'

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
