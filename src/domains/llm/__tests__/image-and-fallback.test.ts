import { describe, it, expect } from 'vitest'
import { classifyFallbackReason } from '../fallback-reason'
import { estimateImageCostKrw, IMAGE_PRICES_USD, USD_TO_KRW_ESTIMATE } from '../prices'
import { sideTextProvider } from '../side-text'
import { usageRow } from '../usage-log'
import { SolarError } from '../solar'

describe('classifyFallbackReason', () => {
    it('열쇠 없음, 인증, 시간 초과, 한도, 서버를 가른다', () => {
        expect(classifyFallbackReason(new SolarError('UPSTAGE_API_KEY 가 없다', 0))).toBe('missing_key')
        expect(classifyFallbackReason(new SolarError('솔라 응답 403: API key suspended due to insufficient credit', 403))).toBe('auth')
        expect(classifyFallbackReason(new SolarError('솔라 응답 401: bad key', 401))).toBe('auth')
        const t = new Error('The operation was aborted due to timeout'); t.name = 'TimeoutError'
        expect(classifyFallbackReason(t)).toBe('timeout')
        expect(classifyFallbackReason(new SolarError('솔라 응답 429: slow down', 429))).toBe('rate_limit')
        expect(classifyFallbackReason(new SolarError('솔라 응답 503: busy', 503))).toBe('server')
        expect(classifyFallbackReason(new Error('something'))).toBe('other')
        expect(classifyFallbackReason(null)).toBe('empty')
    })
})

describe('사진 가격', () => {
    it('새 빠른 모델이 종료 모델보다 싸다 (1K 한 장)', () => {
        expect(IMAGE_PRICES_USD['gemini-3.1-flash-lite-image'].perImageUsd).toBeLessThan(IMAGE_PRICES_USD['gemini-2.5-flash-image'].perImageUsd)
        expect(IMAGE_PRICES_USD['gemini-3-pro-image'].perImageUsd).toBe(IMAGE_PRICES_USD['gemini-3-pro-image-preview'].perImageUsd)
    })
    it('장수와 입력 토큰으로 원화를 낸다', () => {
        const krw = estimateImageCostKrw('gemini-3.1-flash-lite-image', 1, 1000)!
        expect(krw).toBeCloseTo((0.0336 + 1000 * 0.25 / 1e6) * USD_TO_KRW_ESTIMATE, 2)
        expect(estimateImageCostKrw('models/gemini-3-pro-image', 2, 0)).toBeCloseTo(0.268 * USD_TO_KRW_ESTIMATE, 2)
        expect(estimateImageCostKrw('모르는-모델', 1, 0)).toBeNull()
    })
})

describe('곁일 스위치', () => {
    it('기본은 gemini, solar 라고 적어야만 솔라', () => {
        expect(sideTextProvider({})).toBe('gemini')
        expect(sideTextProvider({ SIDE_TEXT_PROVIDER: ' Solar ' })).toBe('solar')
        expect(sideTextProvider({ SIDE_TEXT_PROVIDER: 'openai' })).toBe('gemini')
    })
})

describe('usageRow 새 칸', () => {
    it('되돌아간 까닭, 사진 장수, 검색 횟수를 담는다', () => {
        const r = usageRow({ route: '/x', kind: 'image', model: 'gemini-3.1-flash-lite-image', provider: 'gemini', imageCount: 1, costKrw: 46, fallbackReason: 'auth', searchQueries: 2 })
        expect(r.image_count).toBe(1)
        expect(r.fallback_reason).toBe('auth')
        expect(r.search_queries).toBe(2)
        expect(r.cost_krw).toBe(46)
    })
})
