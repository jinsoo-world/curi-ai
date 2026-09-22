import { describe, it, expect } from 'vitest'
import { pickDriver } from '../driver'

const both = { UPSTAGE_API_KEY: 'up', GEMINI_API_KEY: 'gm' }

describe('llm/driver — 어느 모델로 답할지 고르기', () => {
    it('기본값: 솔라 열쇠가 있으면 솔라', () => {
        expect(pickDriver({ hasImage: false, env: both })).toBe('solar')
    })

    it('솔라 열쇠가 없으면 Gemini 로', () => {
        expect(pickDriver({ hasImage: false, env: { GEMINI_API_KEY: 'gm' } })).toBe('gemini')
    })

    it('LLM_DRIVER=gemini 로 못 박으면 열쇠가 있어도 Gemini', () => {
        expect(pickDriver({ hasImage: false, env: { ...both, LLM_DRIVER: 'gemini' } })).toBe('gemini')
    })

    it('LLM_DRIVER=solar 인데 솔라 열쇠가 없으면 Gemini 로 내려간다(죽지 않는다)', () => {
        expect(pickDriver({ hasImage: false, env: { GEMINI_API_KEY: 'gm', LLM_DRIVER: 'solar' } })).toBe('gemini')
    })

    it('사진이 붙은 대화는 Gemini(사진을 볼 수 있는 쪽)로 보낸다', () => {
        expect(pickDriver({ hasImage: true, env: both })).toBe('gemini')
    })

    it('사진이 붙었는데 Gemini 열쇠가 없으면 솔라로 글만 본다', () => {
        expect(pickDriver({ hasImage: true, env: { UPSTAGE_API_KEY: 'up' } })).toBe('solar')
    })

    it('열쇠가 둘 다 없으면 none (호출 쪽이 「쉬는 중」을 보여준다)', () => {
        expect(pickDriver({ hasImage: false, env: {} })).toBe('none')
    })
})
