import { describe, it, expect, afterEach, vi } from 'vitest'
import { estimateCostKrw, priceKey, USD_TO_KRW_ESTIMATE } from '../prices'
import { usageRow, logLlmUsage, setUsageInserterForTest, usageLogEnabled, geminiTokens } from '../usage-log'

describe('prices', () => {
    it('솔라 프로 100만 입력 + 100만 출력 = 1.5달러', () => {
        expect(estimateCostKrw('solar-pro4', 1_000_000, 1_000_000)).toBeCloseTo(1.5 * USD_TO_KRW_ESTIMATE, 2)
    })
    it('판 번호 붙은 이름도 찾는다', () => {
        expect(priceKey('solar-pro4-260806')).toBe('solar-pro4')
        expect(priceKey('models/gemini-3.8-flash')).toBe('gemini-3.8-flash')
    })
    it('모르는 모델은 null', () => {
        expect(estimateCostKrw('mystery-1', 100, 100)).toBeNull()
    })
})

describe('usageRow', () => {
    it('uuid 가 아니면 비운다, 캐시는 0원', () => {
        const r = usageRow({ route: '/api/chat', kind: 'cache', model: 'cache', userId: 'guest', cacheHit: true, inputTokens: 10 })
        expect(r.user_id).toBeNull()
        expect(r.cost_krw).toBe(0)
        expect(r.cache_hit).toBe(true)
    })
    it('직접 준 원화를 쓴다', () => {
        const r = usageRow({ route: 'youtube-gemini', kind: 'youtube', model: 'gemini-3.5-flash-lite', costKrw: 12.5 })
        expect(r.cost_krw).toBe(12.5)
    })
})

describe('logLlmUsage', () => {
    afterEach(() => { setUsageInserterForTest(null); vi.unstubAllEnvs() })

    it('기다리지 않고 표에 한 줄 넣는다', async () => {
        const rows: unknown[] = []
        setUsageInserterForTest(async r => { rows.push(r) })
        logLlmUsage({ route: '/api/chat', kind: 'chat', model: 'solar-pro4', inputTokens: 100, outputTokens: 50 })
        expect(rows.length).toBe(0)
        await new Promise(r => setTimeout(r, 0))
        expect(rows.length).toBe(1)
    })
    it('넣다 실패해도 던지지 않는다', async () => {
        setUsageInserterForTest(async () => { throw new Error('db down') })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        expect(() => logLlmUsage({ route: 'x', kind: 'chat', model: 'solar-pro4' })).not.toThrow()
        await new Promise(r => setTimeout(r, 0))
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })
    it('끄기 스위치', async () => {
        vi.stubEnv('LLM_USAGE_LOG_ENABLED', 'false')
        expect(usageLogEnabled()).toBe(false)
        const rows: unknown[] = []
        setUsageInserterForTest(async r => { rows.push(r) })
        logLlmUsage({ route: 'x', kind: 'chat', model: 'solar-pro4' })
        await new Promise(r => setTimeout(r, 0))
        expect(rows.length).toBe(0)
    })
})

describe('geminiTokens', () => {
    it('생각 토큰은 출력에 더한다', () => {
        expect(geminiTokens({ promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 3 })).toEqual({ input: 10, output: 8 })
        expect(geminiTokens(undefined)).toEqual({ input: null, output: null })
    })
})
