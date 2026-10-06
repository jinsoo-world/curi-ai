import { describe, it, expect } from 'vitest'
import { createChatDeadline, withinBudget, CHAT_DEADLINE_MS, ANSWER_RESERVE_MS } from '../deadline'
import { trimHistory } from '../history-trim'

describe('대화 마감 시각', () => {
    it('시작 + 55초, 곁가지 일은 min(자기 상한, 남은 시간 - 25초)', () => {
        let t = 1_000
        const d = createChatDeadline(1_000, { now: () => t })
        expect(d.at).toBe(1_000 + CHAT_DEADLINE_MS)
        expect(d.sideBudget(10_000)).toBe(10_000)
        t = 1_000 + 25_000           // 남은 30초 → 답 몫 25초 빼면 5초
        expect(d.sideBudget(10_000)).toBe(5_000)
        t = 1_000 + CHAT_DEADLINE_MS - ANSWER_RESERVE_MS   // 답 몫만 남음
        expect(d.sideBudget(10_000)).toBe(0)
        t = 1_000 + CHAT_DEADLINE_MS + 5_000
        expect(d.remaining()).toBe(0)
    })

    it('시간 안에 끝나면 결과를, 넘기면 기본값을 돌려준다', async () => {
        await expect(withinBudget(Promise.resolve(3), 100, 0)).resolves.toBe(3)
        const slow = new Promise<number>(r => setTimeout(() => r(9), 300))
        const started = Date.now()
        await expect(withinBudget(slow, 20, -1)).resolves.toBe(-1)
        expect(Date.now() - started).toBeLessThan(200)
    })

    it('시간이 0 이면 함수 일은 시작도 안 한다', async () => {
        let started = false
        await expect(withinBudget(async () => { started = true; return 1 }, 0, 0)).resolves.toBe(0)
        expect(started).toBe(false)
    })

    it('함수 일에는 끊기 신호를 넘기고, 던지면 기본값', async () => {
        let got: AbortSignal | null = null
        await withinBudget(async (s) => { got = s; return 1 }, 100, 0)
        expect(got).toBeInstanceOf(AbortSignal)
        await expect(withinBudget(Promise.reject(new Error('x')), 100, 'fb')).resolves.toBe('fb')
    })
})

describe('지난 대화 줄이기', () => {
    const turn = (i: number) => [{ role: 'user', content: `질문${i}` }, { role: 'assistant', content: `답${i}` }]
    it('최근 40통까지만, 사용자 말로 시작', () => {
        const msgs = [...Array.from({ length: 30 }, (_, i) => turn(i)).flat(), { role: 'user', content: '이번 질문' }]
        const out = trimHistory(msgs)
        expect(out.length).toBeLessThanOrEqual(40)
        expect(out[0].role).toBe('user')
        expect(out.at(-1)?.content).toBe('이번 질문')
    })
    it('2만 자를 넘기면 앞을 자른다. 마지막 말은 길어도 남긴다', () => {
        const big = 'ㄱ'.repeat(15_000)
        const out = trimHistory([{ role: 'user', content: big }, { role: 'assistant', content: big }, { role: 'user', content: big + big }])
        expect(out).toHaveLength(1)
        expect(String(out[0].content).length).toBe(30_000)
    })
    it('짧은 대화는 그대로', () => {
        const msgs = turn(1).concat([{ role: 'user', content: 'q' }])
        expect(trimHistory(msgs)).toEqual(msgs)
    })
})
