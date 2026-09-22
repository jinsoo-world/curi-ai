import { describe, it, expect } from 'vitest'
import { geminiToOpenAi } from '../convert'
import type { GeminiMessage } from '@/domains/chat/types'

describe('llm/convert — Gemini 대화 기록을 솔라(OpenAI 호환) 형식으로', () => {
    it('시스템 프롬프트가 맨 앞에, model 은 assistant 로 바뀐다', () => {
        const history: GeminiMessage[] = [
            { role: 'user', parts: [{ text: '(시스템 설정 완료.)' }] },
            { role: 'model', parts: [{ text: '안녕하세요, 반가워요.' }] },
            { role: 'user', parts: [{ text: '요즘 고민이 있어요' }] },
        ]
        const { messages, hasImage } = geminiToOpenAi('너는 따뜻한 코치다.', history)
        expect(hasImage).toBe(false)
        expect(messages).toEqual([
            { role: 'system', content: '너는 따뜻한 코치다.' },
            { role: 'user', content: '(시스템 설정 완료.)' },
            { role: 'assistant', content: '안녕하세요, 반가워요.' },
            { role: 'user', content: '요즘 고민이 있어요' },
        ])
    })

    it('사진이 붙은 기록은 hasImage 를 켜고, 글이 없으면 (사진) 이라고 적는다', () => {
        const history: GeminiMessage[] = [
            { role: 'user', parts: [{ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } }] },
        ]
        const { messages, hasImage } = geminiToOpenAi('시스템', history)
        expect(hasImage).toBe(true)
        expect(messages[1]).toEqual({ role: 'user', content: '(사진)' })
    })

    it('글 조각이 여러 개면 줄바꿈으로 이어붙인다', () => {
        const history: GeminiMessage[] = [
            { role: 'user', parts: [{ text: '첫 줄' }, { text: '둘째 줄' }] },
        ]
        const { messages } = geminiToOpenAi('s', history)
        expect(messages[1].content).toBe('첫 줄\n둘째 줄')
    })

    it('시스템 프롬프트가 비어 있으면 system 줄을 넣지 않는다', () => {
        const { messages } = geminiToOpenAi('', [{ role: 'user', parts: [{ text: '안녕' }] }])
        expect(messages[0]).toEqual({ role: 'user', content: '안녕' })
    })
})
