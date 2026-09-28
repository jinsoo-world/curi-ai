import { describe, it, expect, vi } from 'vitest'
import {
    buildRouterPrompt, parseRouterReply, fallbackResponder, routeGroupReply,
    isPassReply, buildGroupSystemPrompt, botRoleSummary, MAX_GROUP_REPLIES, PASS_TOKEN,
} from '../group-router'

const 봇들 = [
    { mentorId: 'a', name: '비서실장', oneLiner: '일정과 할 일을 챙긴다', systemPrompt: '너는 비서실장. 일정 관리, 회의 준비, 할 일 정리를 돕는다.' },
    { mentorId: 'b', name: '글감봇', oneLiner: '블로그 글감을 찾는다', systemPrompt: '너는 글감봇. 블로그와 뉴스레터 글감, 제목, 초안을 만든다.' },
    { mentorId: 'c', name: '데이터봇', oneLiner: null, systemPrompt: '너는 데이터봇. 매출 숫자, 지표, 엑셀 분석을 맡는다.' },
]

describe('buildRouterPrompt', () => {
    it('봇 번호, 이름, 역할 요약과 주인 말을 담는다', () => {
        const { system, user } = buildRouterPrompt('이번 주 매출 어때?', 봇들, [{ who: '주인', text: '안녕' }])
        expect(system).toMatch(/한 명/)
        expect(user).toContain('1. 비서실장')
        expect(user).toContain('3. 데이터봇')
        expect(user).toContain('매출 숫자')
        expect(user).toContain('이번 주 매출 어때?')
        expect(user).toContain('주인: 안녕')
    })
    it('역할 요약은 길이를 자른다', () => {
        const s = botRoleSummary({ mentorId: 'x', name: 'x', systemPrompt: '가'.repeat(1000) })
        expect(s.length).toBeLessThan(300)
    })
    it('역할 설명이 없어도 죽지 않는다', () => {
        expect(botRoleSummary({ mentorId: 'x', name: 'x' })).toBe('(역할 설명 없음)')
    })
})

describe('parseRouterReply', () => {
    it('번호 하나', () => {
        expect(parseRouterReply('3', 봇들)).toEqual(['c'])
    })
    it('번호 여러 개, 중복과 범위 밖은 버린다', () => {
        expect(parseRouterReply('2, 2, 9, 1', 봇들)).toEqual(['b', 'a'])
    })
    it('상한을 넘지 않는다', () => {
        expect(parseRouterReply('1,2,3', 봇들, 2)).toEqual(['a', 'b'])
        expect(MAX_GROUP_REPLIES).toBeLessThan(4)
    })
    it('번호 대신 이름으로 답해도 읽는다', () => {
        expect(parseRouterReply('글감봇', 봇들)).toEqual(['b'])
    })
    it('빈 답이나 엉뚱한 답은 빈 배열', () => {
        expect(parseRouterReply(null, 봇들)).toEqual([])
        expect(parseRouterReply('모르겠어요', 봇들)).toEqual([])
    })
})

describe('fallbackResponder — 라우터가 죽어도 한 명만', () => {
    it('역할 낱말이 겹치는 봇을 고른다', () => {
        expect(fallbackResponder('매출 지표 좀 봐줘', 봇들)).toBe('c')
        expect(fallbackResponder('블로그 글감 없을까', 봇들)).toBe('b')
    })
    it('이름을 부르면 그 봇', () => {
        expect(fallbackResponder('데이터봇 생각은?', 봇들)).toBe('c')
    })
    it('안 겹치면 방에 먼저 넣은 봇', () => {
        expect(fallbackResponder('ㅎㅎ', 봇들)).toBe('a')
    })
    it('봇이 없으면 null', () => {
        expect(fallbackResponder('안녕', [])).toBeNull()
    })
})

describe('routeGroupReply', () => {
    it('모델이 고른 봇만 답한다 (전원 아님)', async () => {
        const ask = vi.fn().mockResolvedValue('3')
        expect(await routeGroupReply('매출 어때', 봇들, [], ask)).toEqual(['c'])
        expect(ask).toHaveBeenCalledOnce()
    })
    it('모델이 실패하면 폴백 한 명', async () => {
        const ask = vi.fn().mockResolvedValue(null)
        const got = await routeGroupReply('블로그 글감 줘', 봇들, [], ask)
        expect(got).toEqual(['b'])
    })
    it('모델이 던져도 폴백 한 명', async () => {
        const ask = vi.fn().mockRejectedValue(new Error('down'))
        expect(await routeGroupReply('아무말', 봇들, [], ask)).toHaveLength(1)
    })
    it('봇이 한 명이면 묻지 않는다', async () => {
        const ask = vi.fn()
        expect(await routeGroupReply('안녕', [봇들[0]!], [], ask)).toEqual(['a'])
        expect(ask).not.toHaveBeenCalled()
    })
    it('봇이 없으면 빈 배열', async () => {
        expect(await routeGroupReply('안녕', [], [], vi.fn())).toEqual([])
    })
})

describe('isPassReply', () => {
    it('PASS 표지를 알아본다', () => {
        expect(isPassReply(PASS_TOKEN)).toBe(true)
        expect(isPassReply(' pass ')).toBe(true)
        expect(isPassReply('패스')).toBe(true)
        expect(isPassReply('')).toBe(true)
        expect(isPassReply(null)).toBe(true)
    })
    it('보통 답은 PASS 가 아니다', () => {
        expect(isPassReply('패스트푸드 얘기라면 제가 알아요')).toBe(false)
        expect(isPassReply('좋아요, 제가 볼게요')).toBe(false)
    })
})

describe('buildGroupSystemPrompt — 봇 고유 프롬프트가 주인공, 방장 없음', () => {
    const [나, ...남] = 봇들
    it('봇 고유 프롬프트로 시작한다', () => {
        const p = buildGroupSystemPrompt(나!, 남, 'routed-first')
        expect(p.startsWith(나!.systemPrompt!)).toBe(true)
        expect(p).toContain('글감봇')
        expect(p).toContain('데이터봇')
    })
    it('진행, 사회, 차례 나누기 지시가 없다', () => {
        for (const mode of ['mention', 'routed-first', 'routed-next'] as const) {
            const p = buildGroupSystemPrompt(나!, 남, mode)
            expect(p).not.toMatch(/진행 봇|진행자|사회자|방장|몫을 .*나눠 준다/)
            expect(p).toContain('진행하거나')   // 하지 말라는 금지 문장만
        }
    })
    it('뒤 차례 봇만 PASS 로 빠질 수 있다', () => {
        expect(buildGroupSystemPrompt(나!, 남, 'routed-next')).toContain(PASS_TOKEN)
        expect(buildGroupSystemPrompt(나!, 남, 'routed-first')).not.toContain(PASS_TOKEN)
        expect(buildGroupSystemPrompt(나!, 남, 'mention')).not.toContain(PASS_TOKEN)
    })
    it('@ 부르기는 콕 집힌 봇만 한 명까지', () => {
        expect(buildGroupSystemPrompt(나!, 남, 'mention')).toMatch(/한 명만 @이름/)
        expect(buildGroupSystemPrompt(나!, 남, 'routed-first')).toMatch(/부르지 않는다/)
    })
    it('프롬프트가 비면 이름과 한 줄 소개로 채운다', () => {
        const p = buildGroupSystemPrompt({ mentorId: 'z', name: '빈봇', oneLiner: '짧게 말한다', systemPrompt: '' }, 남, 'routed-first')
        expect(p).toContain('「빈봇」')
        expect(p).toContain('짧게 말한다')
    })
    it('가운뎃점이나 긴 줄표가 없다', () => {
        expect(buildGroupSystemPrompt(나!, 남, 'routed-next')).not.toMatch(/[·—]/)
        expect(buildRouterPrompt('안녕', 봇들).system).not.toMatch(/[·—]/)
    })
})
