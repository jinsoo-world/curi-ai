import { describe, it, expect, vi } from 'vitest'
import { correctiveRetrieve, cleanRewrite, buildRewriteInput, needsCorrection } from '../corrective'

const weak = [{ content: '엉뚱한 조각', similarity: 0.62 }]
const strong = [{ content: '맞는 조각', similarity: 0.81 }]

function deps(over: Partial<Parameters<typeof correctiveRetrieve>[0]> = {}) {
    return {
        rewrite: vi.fn(async () => 'DOHL 5개년 매출 목표'),
        embed: vi.fn(async () => [0.1, 0.2]),
        search: vi.fn(async () => strong),
        ...over,
    }
}

describe('correctiveRetrieve', () => {
    it('검색이 잘 된 질문은 아무것도 안 부른다 (평소 비용 그대로)', async () => {
        const d = deps()
        const r = await correctiveRetrieve(d, { question: 'DOHL 매출 목표', history: [], original: strong, minSim: 0.72, enabled: true })
        expect(r.tried).toBe(false)
        expect(d.rewrite).not.toHaveBeenCalled()
    })
    it('시원찮으면 한 번 고쳐 찾고 더 나은 쪽을 쓴다', async () => {
        const d = deps()
        const r = await correctiveRetrieve(d, { question: '그거 목표가 얼마야?', history: [{ role: 'user', content: 'DOHL 사업계획서 봤어?' }], original: weak, minSim: 0.72, enabled: true })
        expect(r.used).toBe(true)
        expect(r.matches).toEqual(strong)
        expect(d.rewrite).toHaveBeenCalledTimes(1)
    })
    it('다시 찾아도 못하면 원래 결과 그대로', async () => {
        const d = deps({ search: vi.fn(async () => [{ content: '더 엉뚱', similarity: 0.5 }]) })
        const r = await correctiveRetrieve(d, { question: '아무거나', history: [], original: weak, minSim: 0.72, enabled: true })
        expect(r.used).toBe(false)
        expect(r.matches).toEqual(weak)
    })
    it('다시 쓰기가 실패(시간 초과 등)해도 던지지 않는다', async () => {
        const d = deps({ rewrite: vi.fn(async () => { throw new Error('timeout') }) })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const r = await correctiveRetrieve(d, { question: '질문', history: [], original: [], minSim: 0.72, enabled: true })
        expect(r.matches).toEqual([])
        warn.mockRestore()
    })
    it('끄면 안 부른다', async () => {
        const d = deps()
        await correctiveRetrieve(d, { question: '질문', history: [], original: weak, minSim: 0.72, enabled: false })
        expect(d.rewrite).not.toHaveBeenCalled()
    })
})

describe('cleanRewrite', () => {
    it('머리말과 따옴표를 떼고 첫 줄만', () => {
        expect(cleanRewrite('검색어: "DOHL 매출 목표"\n설명...', 'x')).toBe('DOHL 매출 목표')
    })
    it('원래 질문과 같으면 null', () => {
        expect(cleanRewrite('DOHL 매출 목표?', 'DOHL 매출 목표')).toBeNull()
    })
})

describe('buildRewriteInput / needsCorrection', () => {
    it('앞 대화 6줄까지', () => {
        const h = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `말${i}` }))
        const t = buildRewriteInput(h, '마지막')
        expect(t).toContain('말9')
        expect(t).not.toContain('말3')
    })
    it('문턱 아래면 고쳐 찾기', () => {
        expect(needsCorrection([], 0.72)).toBe(true)
        expect(needsCorrection(strong, 0.72)).toBe(false)
    })
})
