import { describe, it, expect } from 'vitest'
import { cacheEligibility, cacheScopeKey, botVersion, isStorableAnswer, cacheMinSimilarity, semanticCacheEnabled } from '../semantic-cache'
import type { CacheCheckInput } from '../semantic-cache'

const base: CacheCheckInput = {
    enabled: true, userTurns: 1, text: '팁스 해외마케팅 모집 대상이 누구인가요', hasLink: false, hasImage: false,
    personalized: false, extractionAttempt: false, topSimilarity: 0.8, minKnowledgeSimilarity: 0.72, hasEmbedding: true,
}

describe('cacheEligibility', () => {
    it('좁은 조건을 다 통과하면 된다', () => {
        expect(cacheEligibility(base).ok).toBe(true)
    })
    it.each([
        ['off', { enabled: false }],
        ['not-first-turn', { userTurns: 2 }],
        ['link', { hasLink: true }],
        ['image', { hasImage: true }],
        ['personal', { personalized: true }],
        ['extraction', { extractionAttempt: true }],
        ['weak-knowledge', { topSimilarity: 0.6 }],
        ['weak-knowledge', { topSimilarity: null }],
        ['no-embedding', { hasEmbedding: false }],
        ['time-sensitive', { text: '요즘 팁스 모집 일정 알려줘' }],
        ['time-sensitive', { text: '오늘 마감이야?' }],
        ['personal-tool', { text: '노션에서 사업계획서 찾아줘' }],
        ['length', { text: '안녕' }],
    ] as [string, Partial<CacheCheckInput>][])('%s 이면 안 된다', (reason, patch) => {
        const r = cacheEligibility({ ...base, ...patch })
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.reason).toBe(reason)
    })
})

describe('cacheScopeKey', () => {
    it('공개 봇은 한 칸, 개인 봇은 주인별 칸', () => {
        expect(cacheScopeKey('public', 'u1')).toBe('public')
        expect(cacheScopeKey('personal', 'u1')).toBe('owner:u1')
        expect(cacheScopeKey('personal', 'u2')).not.toBe(cacheScopeKey('personal', 'u1'))
        expect(cacheScopeKey('personal', null)).toBeNull()
    })
})

describe('botVersion', () => {
    const p = { systemPrompt: '[지금]\n오늘은 2026년 9월 28일 월요일 오후 10:40 입니다.\n너는 커피 봇', settings: { a: 1 }, knowledgeVersion: 'k1', model: 'solar-pro4' }
    it('지금 시각이 바뀌어도 같다', () => {
        expect(botVersion(p)).toBe(botVersion({ ...p, systemPrompt: p.systemPrompt.replace('10:40', '11:05') }))
    })
    it('지침, 설정, 자료, 모델 중 하나라도 바뀌면 달라진다', () => {
        const v = botVersion(p)
        expect(botVersion({ ...p, systemPrompt: p.systemPrompt + '!' })).not.toBe(v)
        expect(botVersion({ ...p, settings: { a: 2 } })).not.toBe(v)
        expect(botVersion({ ...p, knowledgeVersion: 'k2' })).not.toBe(v)
        expect(botVersion({ ...p, model: 'solar-pro5' })).not.toBe(v)
    })
})

describe('isStorableAnswer', () => {
    const ok = { text: '팁스 해외마케팅은 창업 7년 이내 기업이 대상이에요. 자세한 조건은 공고를 봐 주세요.', guardTripped: false, solarAnswered: true, unavailableText: '쉬는 중' }
    it('끝까지 나온 솔라 답만', () => {
        expect(isStorableAnswer(ok)).toBe(true)
        expect(isStorableAnswer({ ...ok, guardTripped: true })).toBe(false)
        expect(isStorableAnswer({ ...ok, solarAnswered: false })).toBe(false)
        expect(isStorableAnswer({ ...ok, text: '쉬는 중' })).toBe(false)
        expect(isStorableAnswer({ ...ok, text: '짧음' })).toBe(false)
    })
})

describe('스위치와 문턱', () => {
    it('기본은 켬, 0.96', () => {
        expect(semanticCacheEnabled({})).toBe(true)
        expect(semanticCacheEnabled({ SEMANTIC_CACHE_ENABLED: 'false' })).toBe(false)
        expect(cacheMinSimilarity({})).toBe(0.96)
    })
    it('문턱은 0.95 아래로 못 내린다', () => {
        expect(cacheMinSimilarity({ SEMANTIC_CACHE_MIN_SIM: '0.8' })).toBe(0.96)
        expect(cacheMinSimilarity({ SEMANTIC_CACHE_MIN_SIM: '0.94' })).toBe(0.96)
        expect(cacheMinSimilarity({ SEMANTIC_CACHE_MIN_SIM: '0.97' })).toBe(0.97)
    })
})
