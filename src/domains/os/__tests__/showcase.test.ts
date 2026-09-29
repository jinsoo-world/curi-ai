import { describe, it, expect } from 'vitest'
import { DEMO_MENTOR_IDS, isDemoMentor, arrangeMarket, isSampleMarketBot, withAsk, takeAsk } from '../showcase'
import { checkAudience } from '../audience'

describe('os/showcase — 둘러보기 팀·봇 마켓 진열 (가상 리더 10명 사용시험 0929)', () => {
    it('둘러보기 팀 4명(기획·홍보·개발·조사팀장)은 고정 id 4개', () => {
        expect(DEMO_MENTOR_IDS.size).toBe(4)
        expect(isDemoMentor('9fc9b3fa-1721-40c6-bc4e-1b544c117483')).toBe(true)
        expect(isDemoMentor('38232296-705a-4a00-9dee-e76fff40d777')).toBe(false)
        expect(isDemoMentor(null)).toBe(false)
    })

    it('Public 봇: 로그인 전 손님은 막지만, 둘러보기 팀 봇이면 통과 (손님 하루 한도는 chat 라우트가 따로 센다)', () => {
        const base = { level: 'public' as const, isOwner: false, isLoggedIn: false, inAllowedGroup: false }
        expect(checkAudience(base).allowed).toBe(false)
        expect(checkAudience({ ...base, isDemoBot: true })).toEqual({ allowed: true, reason: null, message: null })
    })

    it('둘러보기 팀이라도 Just Me·Insiders 로 바뀌었으면 그대로 막는다', () => {
        expect(checkAudience({ level: 'just_me', isOwner: false, isLoggedIn: false, inAllowedGroup: false, isDemoBot: true }).allowed).toBe(false)
        expect(checkAudience({ level: 'insiders', isOwner: false, isLoggedIn: false, inAllowedGroup: false, isDemoBot: true }).allowed).toBe(false)
    })

    it('봇 마켓: 시험용 봇은 빼고, 예시 봇은 진짜 리더 봇 뒤로 보낸다 (순서는 그 안에서 유지)', () => {
        const list = [
            { id: 'b453ce4e-2bb3-4c10-8618-75037dcb292a', name: '하선영' },
            { id: 'real-1', name: '미니린' },
            { id: '6c4f7434-01a5-4c37-9b52-efbc363e77d6', name: '코덱스봇' },
            { id: '118bef35-26bc-4118-a446-aa96e977f9ee', name: '오재현' },
            { id: 'real-2', name: '글담쌤' },
        ]
        expect(arrangeMarket(list).map(m => m.name)).toEqual(['미니린', '글담쌤', '하선영', '오재현'])
        expect(isSampleMarketBot('b453ce4e-2bb3-4c10-8618-75037dcb292a')).toBe(true)
        expect(isSampleMarketBot('real-1')).toBe(false)
    })

    it('질문 칩: 대화 주소에 ask 를 붙이고, 대화 화면은 한 번만 꺼낸다', () => {
        expect(withAsk('/os/chat/abc?demo=1', '블로그 수익화 방법 궁금해요.')).toBe('/os/chat/abc?demo=1&ask=%EB%B8%94%EB%A1%9C%EA%B7%B8+%EC%88%98%EC%9D%B5%ED%99%94+%EB%B0%A9%EB%B2%95+%EA%B6%81%EA%B8%88%ED%95%B4%EC%9A%94.')
        expect(withAsk('/os/chat/abc', 'hi')).toBe('/os/chat/abc?ask=hi')
        const r = takeAsk('https://x.com/os/chat/abc?demo=1&ask=%ED%95%98%EC%9D%B4')
        expect(r).toEqual({ ask: '하이', rest: '/os/chat/abc?demo=1' })
        expect(takeAsk('https://x.com/os/chat/abc?demo=1')).toEqual({ ask: null, rest: '/os/chat/abc?demo=1' })
        expect(takeAsk('https://x.com/os/chat/abc?ask=' + 'a'.repeat(600)).ask?.length).toBe(500)
    })
})
