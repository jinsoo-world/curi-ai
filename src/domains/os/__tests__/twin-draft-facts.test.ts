// 초안이 리더 자료의 구체적 사실(숫자, 사례, 고유 표현)을 근거로 만들어지는가 (1003). 모델, 인터넷 없음.
import { describe, it, expect } from 'vitest'
import { draftAsk, draftPrompt, parseDraftAnswer, citesFact, postUrlOf } from '../twin-draft'

const fact1 = '2019년에 퇴사하고 첫 강의에서 수강생 37명을 모았다'
const fact2 = '매일 새벽 5시에 블로그 글 한 편을 쓴다'
const answer = (over: Record<string, unknown> = {}) => JSON.stringify({
    names: ['진쌤봇'], oneLiner: '퇴사 후 강의 이야기', greeting: '반가워요! 무엇이든 물어보세요.',
    audience: '수강생', topics: ['강의'], voiceRules: ['짧게 쓴다'], limits: [], chips: ['첫 강의 어땠어요?'],
    facts: [{ text: fact1, from: 1 }, { text: fact2, from: 2 }, { text: '', from: 1 }],
    phrases: ['일단 해 보는 거예요', '천천히 가도 괜찮아요'],
    examples: [
        { q: '처음 강의 어땠어요?', a: '2019년에 퇴사하고 첫 강의에서 37명을 만났어요. 일단 해 보는 거예요.' },
        { q: '글은 언제 써요?', a: '저는 매일 새벽 5시에 한 편씩 써요.' },
    ],
    guessed: [],
    ...over,
})

describe('모델에게 묻는 글', () => {
    it('사실, 고유 표현, 예시 2쌍을 달라고 하고 인사말과 예시가 사실을 인용하라고 한다', () => {
        const ask = draftAsk('열정진', [{ title: '블로그', url: 'https://blog.naver.com/me/1', text: '글' }])
        expect(ask).toContain('"facts"')
        expect(ask).toContain('"phrases"')
        expect(ask).toContain('"examples"')
        expect(ask).toMatch(/인사말.*사실/)
    })
    it('긴 자료는 뒤쪽의 숫자 문장도 보여 준다 (앞 1,500자만이 아니다)', () => {
        const filler = '그냥 평범한 문장입니다. '.repeat(400)
        const ask = draftAsk('열정진', [{ title: '블로그', url: '', text: `${filler}저는 수강생 37명과 시작했어요. ${filler}` }])
        expect(ask).toContain('수강생 37명과 시작했어요')
    })
    it('글 날짜가 있으면 자료 머리에 적는다', () => {
        const ask = draftAsk('열정진', [{ title: '블로그', url: '', text: '글', publishedAt: '2026-09-01T03:00:00.000Z' }])
        expect(ask).toContain('2026-09-01')
    })
})

describe('모델 답 정리', () => {
    it('사실, 고유 표현, 예시 2쌍을 받는다. 빈 사실은 뺀다. example 은 첫 쌍', () => {
        const d = parseDraftAnswer(answer())!
        expect(d.facts).toEqual([{ text: fact1, from: 1 }, { text: fact2, from: 2 }])
        expect(d.phrases).toEqual(['일단 해 보는 거예요', '천천히 가도 괜찮아요'])
        expect(d.examples).toHaveLength(2)
        expect(d.example.q).toBe('처음 강의 어땠어요?')
    })
    it('인사말이 사실을 하나도 인용하지 않으면 사실 하나를 붙인다 (200자 안)', () => {
        const d = parseDraftAnswer(answer())!
        expect(citesFact(d.greeting, d.facts!.map(f => f.text))).toBe(true)
        expect(d.greeting.length).toBeLessThanOrEqual(140)
    })
    it('인사말이 이미 사실을 인용했으면 그대로 둔다', () => {
        const g = '반가워요. 저는 매일 새벽 5시에 글을 써요. 같이 써 볼까요?'
        const d = parseDraftAnswer(answer({ greeting: g }))!
        expect(d.greeting).toBe(g)
    })
    it('사실을 인용하지 않은 예시는 「추정」으로 표시한다', () => {
        const d = parseDraftAnswer(answer({ examples: [{ q: '안녕', a: '안녕하세요. 반가워요.' }] }))!
        expect(d.guessed).toContain('example')
    })
    it('예전 모양(example 한 쌍, facts 없음)도 받는다', () => {
        const d = parseDraftAnswer(JSON.stringify({ names: ['a'], greeting: '안녕', example: { q: '질문', a: '답' } }))!
        expect(d.example).toEqual({ q: '질문', a: '답' })
        expect(d.facts).toEqual([])
        expect(d.greeting).toBe('안녕')
    })
})

describe('citesFact', () => {
    it('숫자가 겹치거나 낱말이 두 개 이상 겹치면 인용으로 본다', () => {
        expect(citesFact('첫 수업에 37명이 왔어요', [fact1])).toBe(true)
        expect(citesFact('새벽 블로그 이야기', [fact2])).toBe(true)
        expect(citesFact('반가워요', [fact1, fact2])).toBe(false)
        expect(citesFact('아무 말', [])).toBe(false)
    })
})

describe('봇 설명에 사실과 고유 표현이 들어간다', () => {
    it('사실은 출처 제목과 함께, 표현은 원문 그대로, 예시 2쌍', () => {
        const d = parseDraftAnswer(answer())!
        const p = draftPrompt('열정진', '진쌤봇', d, ['저는 글을 씁니다.'], ['네이버 블로그 첫 글', '두 번째 글'])
        expect(p).toContain('[자료에서 확인한 구체적 사실')
        expect(p).toContain(`- ${fact1} (출처: 네이버 블로그 첫 글)`)
        expect(p).toContain(`- ${fact2} (출처: 두 번째 글)`)
        expect(p).toContain('[이 사람이 실제로 쓰는 표현')
        expect(p).toContain('- 일단 해 보는 거예요')
        expect(p).toContain('글은 언제 써요?')
        expect(p.length).toBeLessThanOrEqual(12_000)
    })
})

describe('postUrlOf: 블로그 글 하나 주소는 그 글을 읽는다', () => {
    it('네이버 글번호, 티스토리 글 주소는 글, 블로그 첫 화면은 null', () => {
        expect(postUrlOf('https://blog.naver.com/me/223456789')).toBe('https://blog.naver.com/me/223456789')
        expect(postUrlOf('https://blog.naver.com/PostView.naver?blogId=me&logNo=223456789')).toBe('https://blog.naver.com/PostView.naver?blogId=me&logNo=223456789')
        expect(postUrlOf('https://blog.naver.com/me')).toBeNull()
        expect(postUrlOf('https://me.tistory.com/12')).toBe('https://me.tistory.com/12')
        expect(postUrlOf('https://me.tistory.com/')).toBeNull()
        expect(postUrlOf('https://me.tistory.com/rss')).toBeNull()
        expect(postUrlOf('https://youtube.com/@me')).toBeNull()
    })
})
