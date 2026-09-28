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
import { setUsageInserterForTest } from '@/domains/llm/usage-log'
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

    it('솔라가 사용량을 주면 마지막에 usage 조각을 흘려보낸다(화면은 text 만 써도 됨)', async () => {
        async function* withUsage() {
            yield { text: '안녕' }
            yield { done: true, usage: { prompt: 11, completion: 3, total: 14 } }
        }
        solarMock.mockReturnValue(withUsage())
        const chunks: { text?: string; usage?: unknown }[] = []
        for await (const c of await generateChatStream('시스템', history)) chunks.push(c)
        expect(chunks.filter(c => c.text).map(c => c.text)).toEqual(['안녕'])
        expect(chunks.at(-1)?.usage).toEqual({ prompt: 11, completion: 3, total: 14 })
    })
})

describe('chat/stream — 솔라 첫 글자가 늦으면 Gemini 로 (0929)', () => {
    const rows: { provider: string | null; fallback: boolean; fallback_reason: string | null }[] = []
    beforeEach(() => {
        solarMock.mockReset()
        geminiMock.mockReset()
        rows.length = 0
        setUsageInserterForTest(async r => { rows.push(r) })
        vi.stubEnv('UPSTAGE_API_KEY', 'up')
        vi.stubEnv('GEMINI_API_KEY', 'gm')
        vi.stubEnv('LLM_DRIVER', '')
        vi.stubEnv('LLM_USAGE_LOG_ENABLED', 'true')
    })

    /** 신호(signal)를 무시하고 ms 뒤에야 첫 글자를 내는 느린 솔라 */
    async function* slowSolar(ms: number) {
        await new Promise(r => setTimeout(r, ms))
        yield { text: '늦은 솔라' }
    }

    it('정한 시간 안에 첫 글자가 없으면 솔라를 끊고 Gemini 가 답한다 (fallback_reason slow)', async () => {
        vi.stubEnv('SOLAR_FIRST_TOKEN_TIMEOUT_MS', '30')
        solarMock.mockReturnValue(slowSolar(300))
        geminiMock.mockResolvedValue(gen(['빠른 제미']))
        const out = await collect(await generateChatStream('시스템', history))
        expect(out).toEqual(['빠른 제미'])
        expect(geminiMock).toHaveBeenCalledTimes(1)
        // 솔라 요청은 끊겼다
        const signal = (solarMock.mock.calls[0][2] as { signal?: AbortSignal }).signal
        expect(signal?.aborted).toBe(true)
        await new Promise(r => setTimeout(r, 0))
        expect(rows.at(-1)).toMatchObject({ provider: 'gemini', fallback: true, fallback_reason: 'slow' })
    })

    it('정한 시간 안에 첫 글자가 오면 그대로 솔라가 답한다(첫 글자 뒤로는 오래 걸려도 안 끊는다)', async () => {
        vi.stubEnv('SOLAR_FIRST_TOKEN_TIMEOUT_MS', '200')
        async function* okThenSlow() {
            yield { text: '솔' }
            await new Promise(r => setTimeout(r, 300))
            yield { text: '라' }
        }
        solarMock.mockReturnValue(okThenSlow())
        const out = await collect(await generateChatStream('시스템', history))
        expect(out).toEqual(['솔', '라'])
        expect(geminiMock).not.toHaveBeenCalled()
    })

    it('0 이면 끈다(느려도 기다린다)', async () => {
        vi.stubEnv('SOLAR_FIRST_TOKEN_TIMEOUT_MS', '0')
        solarMock.mockReturnValue(slowSolar(60))
        const out = await collect(await generateChatStream('시스템', history))
        expect(out).toEqual(['늦은 솔라'])
        expect(geminiMock).not.toHaveBeenCalled()
    })
})

describe('chat/stream — 솔라 답 길이 상한 (0929)', () => {
    beforeEach(() => {
        solarMock.mockReset()
        geminiMock.mockReset()
        vi.stubEnv('UPSTAGE_API_KEY', 'up')
        vi.stubEnv('GEMINI_API_KEY', 'gm')
        vi.stubEnv('LLM_DRIVER', '')
    })
    it.each([
        [900, 500],    // 기본
        [1800, 1000],  // 자세히 (같은 비율)
        [220, 220],    // 짧게는 그대로
        [300, 300],    // 다른 숫자(글자 수 지정 등)는 그대로
    ])('답변 설정 상한 %i → 솔라에는 %i', async (given, expected) => {
        solarMock.mockReturnValue(gen(['x']))
        await collect(await generateChatStream('시스템', history, { maxOutputTokens: given }))
        expect((solarMock.mock.calls[0][2] as { maxTokens?: number }).maxTokens).toBe(expected)
    })
})
