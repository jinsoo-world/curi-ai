import { describe, it, expect } from 'vitest'
import {
    readRelayIntent, relayPrefix, withRelayPrefix, relayAnswerHeader,
    withRelayAnswerHeader, relaySentLine, hasFinalConsonant,
    countRelayTurns, RELAY_MAX_TURNS,
} from '../relay'

const 팀 = [
    { mentorId: 'm1', name: '기획팀장' },
    { mentorId: 'm2', name: '홍보팀장' },
    { mentorId: 'm3', name: '개발팀장' },
]

describe('readRelayIntent — 누구에게 무엇을 옮길까', () => {
    it('「○○에게 이거 전달해 줘: 내용」 에서 대상과 알맹이를 뽑는다', () => {
        expect(readRelayIntent('홍보팀장에게 이거 전달해 줘: 다음 주 이벤트 초안 봐 주세요', 팀, 'm1'))
            .toEqual({ mentorId: 'm2', name: '홍보팀장', message: '다음 주 이벤트 초안 봐 주세요' })
    })

    it('「○○한테 물어봐 줘 내용」 처럼 콜론이 없어도 뽑는다', () => {
        expect(readRelayIntent('개발팀장한테 물어봐 줘 로그인 오류 언제 고쳐지는지', 팀, 'm1'))
            .toEqual({ mentorId: 'm3', name: '개발팀장', message: '로그인 오류 언제 고쳐지는지' })
    })

    it('말이 앞에 오고 「○○한테 전달해 줘」가 뒤에 와도 뽑는다', () => {
        expect(readRelayIntent('로그인 오류 언제 고쳐지는지 개발팀장한테 물어봐 줘', 팀, 'm1'))
            .toEqual({ mentorId: 'm3', name: '개발팀장', message: '로그인 오류 언제 고쳐지는지' })
    })

    it('「…라고 전달해 줘」 에서 앞 글자를 잘라먹지 않는다', () => {
        const r = readRelayIntent('홍보팀장에게 다음 주 이벤트 초안 봐 달라고 전달해 줘', 팀, 'm1')
        expect(r?.mentorId).toBe('m2')
        expect(r?.message).toBe('다음 주 이벤트 초안 봐 달라고')
    })

    it('「님께」 도 알아듣는다', () => {
        expect(readRelayIntent('홍보팀장님께 오늘 회의 결과 알려 줘', 팀, 'm1')?.mentorId).toBe('m2')
    })

    it('팀에 없는 이름이면 null (아무에게나 안 보낸다)', () => {
        expect(readRelayIntent('영업팀장에게 이거 전달해 줘: 안녕', 팀, 'm1')).toBeNull()
    })

    it('지금 말하고 있는 봇 자신에게는 전달하지 않는다', () => {
        expect(readRelayIntent('기획팀장에게 이거 전달해 줘: 안녕', 팀, 'm1')).toBeNull()
    })

    it('옮겨 달라는 말버릇이 없으면 null (그냥 이름을 말한 것)', () => {
        expect(readRelayIntent('홍보팀장에게 어제 뭐라고 했는지 궁금해', 팀, 'm1')).toBeNull()
    })

    it('조사가 없으면 null (이름만 부른 것)', () => {
        expect(readRelayIntent('홍보팀장 요즘 바쁘대', 팀, 'm1')).toBeNull()
    })

    it('옮길 알맹이가 비면 null', () => {
        expect(readRelayIntent('홍보팀장에게 전달해 줘', 팀, 'm1')).toBeNull()
    })

    it('빈 말·빈 팀은 null', () => {
        expect(readRelayIntent('', 팀, 'm1')).toBeNull()
        expect(readRelayIntent('홍보팀장에게 전달해 줘: 안녕', [], 'm1')).toBeNull()
    })

    it('두 사람이 나오면 먼저 나온 한 명에게만 간다 (떼전달 막기)', () => {
        expect(readRelayIntent('개발팀장에게 전달해 줘: 홍보팀장에게도 알려 주세요', 팀, 'm1')?.name).toBe('개발팀장')
    })

    it('알맹이가 너무 길면 자른다', () => {
        const 긴말 = '가'.repeat(5000)
        expect(readRelayIntent(`홍보팀장에게 전달해 줘: ${긴말}`, 팀, 'm1')?.message.length).toBe(2000)
    })
})

describe('표식 — 사용자 눈에 「누가 → 누구」가 보인다', () => {
    it('받침이 있으면 「이 전달」, 없으면 「가 전달」', () => {
        expect(relayPrefix('기획팀장')).toBe('[기획팀장이 전달]')
        expect(relayPrefix('비서')).toBe('[비서가 전달]')
    })

    it('한글이 아닌 이름도 죽지 않는다', () => {
        expect(hasFinalConsonant('Bot')).toBe(false)
        expect(relayPrefix('')).toBe('[옆 봇이 전달]')   // 이름이 비면 「옆 봇」으로 부른다
    })

    it('옮긴 말은 표식 + 원문', () => {
        expect(withRelayPrefix('기획팀장', '초안 봐 주세요')).toBe('[기획팀장이 전달] 초안 봐 주세요')
    })

    it('돌아온 답은 첫 줄에 누구의 답인지 박는다', () => {
        expect(relayAnswerHeader('홍보팀장')).toBe('【홍보팀장의 답】')
        expect(withRelayAnswerHeader('홍보팀장', '좋아요')).toBe('【홍보팀장의 답】\n좋아요')
    })

    it('화면 회색 줄은 「A → B에게 전달했어요」', () => {
        expect(relaySentLine('기획팀장', '홍보팀장')).toBe('기획팀장 → 홍보팀장에게 전달했어요')
    })
})

describe('countRelayTurns — 턴 상한(최대 2턴)', () => {
    it('「【…의 답】」 표식이 붙은 봇 답만 센다', () => {
        const 방 = [
            { role: 'user', content: '홍보팀장에게 전달해 줘: 초안 봐 주세요' },
            { role: 'assistant', content: '【홍보팀장의 답】\n확인했어요' },
            { role: 'user', content: '고마워' },
            { role: 'assistant', content: '천만에요' },   // 표식 없음 = 안 센다
            { role: 'assistant', content: '【홍보팀장의 답】\n한 번 더 답했어요' },
        ]
        expect(countRelayTurns(방)).toBe(2)
        expect(countRelayTurns(방) >= RELAY_MAX_TURNS).toBe(true)
    })

    it('표식이 하나도 없으면 0, 빈 방도 0', () => {
        expect(countRelayTurns([{ role: 'assistant', content: '그냥 답' }])).toBe(0)
        expect(countRelayTurns([])).toBe(0)
    })
})
