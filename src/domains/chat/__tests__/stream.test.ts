import { describe, it, expect, vi, beforeEach } from 'vitest'

// 진짜 모델은 부르지 않는다. 두 드라이버를 가짜로 바꿔 「누가 불렸나」만 본다.
const solarMock = vi.fn()
const geminiMock = vi.fn()
vi.mock('@/domains/llm/solar', () => ({
    solarChatStream: (...args: unknown[]) => solarMock(...args),
    SolarError: class SolarError extends Error { status = 0 },
}))
vi.mock('../gemini', () => ({
    generateChatStream: (...args: unknown[]) => geminiMock(...args),
}))

import { generateChatStream, UNAVAILABLE_TEXT } from '../stream'
import type { GeminiMessage } from '../types'

async function* gen(texts: string[]) {
    for (const t of texts) yield { text: t }
}
async function* failsAtOnce(): AsyncGenerator<{ text: string }> {
    throw new Error('solar down')
}
async function collect(iter: AsyncIterable<{ text?: string }>) {
    const out: string[] = []
    for await (const c of iter) if (c.text) out.push(c.text)
    return out
}

const history: GeminiMessage[] = [{ role: 'user', parts: [{ text: '안녕' }] }]
const withImage: GeminiMessage[] = [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'AA' } }] }]

describe('chat/stream — 드라이버 고르기와 되돌아가기', () => {
    beforeEach(() => {
        solarMock.mockReset()
        geminiMock.mockReset()
        vi.stubEnv('UPSTAGE_API_KEY', 'up')
        vi.stubEnv('GEMINI_API_KEY', 'gm')
        vi.stubEnv('LLM_DRIVER', '')
    })

    it('평소엔 솔라가 답하고 Gemini 는 부르지 않는다', async () => {
        solarMock.mockReturnValue(gen(['솔', '라']))
        const out = await collect(await generateChatStream('시스템', history))
        expect(out).toEqual(['솔', '라'])
        expect(geminiMock).not.toHaveBeenCalled()
    })

    it('솔라가 첫 글자도 못 내고 죽으면 Gemini 로 되돌아간다(사용자는 모른다)', async () => {
        solarMock.mockReturnValue(failsAtOnce())
        geminiMock.mockResolvedValue(gen(['제', '미']))
        const out = await collect(await generateChatStream('시스템', history))
        expect(out).toEqual(['제', '미'])
        expect(geminiMock).toHaveBeenCalledTimes(1)
    })

    it('둘 다 죽으면 오류를 던지지 않고 「쉬는 중」 한 줄을 내놓는다', async () => {
        solarMock.mockReturnValue(failsAtOnce())
        geminiMock.mockRejectedValue(new Error('gemini down'))
        const out = await collect(await generateChatStream('시스템', history))
        expect(out).toEqual([UNAVAILABLE_TEXT])
    })

    it('사진이 붙은 대화는 처음부터 Gemini 가 본다', async () => {
        geminiMock.mockResolvedValue(gen(['사진 봤어요']))
        const out = await collect(await generateChatStream('시스템', withImage))
        expect(out).toEqual(['사진 봤어요'])
        expect(solarMock).not.toHaveBeenCalled()
    })

    it('LLM_DRIVER=gemini 로 못 박으면 솔라를 부르지 않는다(되돌리기 스위치)', async () => {
        vi.stubEnv('LLM_DRIVER', 'gemini')
        geminiMock.mockResolvedValue(gen(['g']))
        await collect(await generateChatStream('시스템', history))
        expect(solarMock).not.toHaveBeenCalled()
    })

    it('솔라가 답하다 중간에 끊기면 그때까지 나온 글은 살리고 조용히 끝낸다', async () => {
        async function* midFail() { yield { text: '반은 ' }; throw new Error('cut') }
        solarMock.mockReturnValue(midFail())
        const out = await collect(await generateChatStream('시스템', history))
        expect(out).toEqual(['반은 '])
        expect(geminiMock).not.toHaveBeenCalled()
    })
})
