import { describe, it, expect, vi, beforeEach } from 'vitest'

// 2026-10-06 멈춤 점검: Gemini 에도 마감(첫 글자 + 남은 시간), 검색 Gemini 가 죽으면 솔라로
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
async function collect(iter: AsyncIterable<{ text?: string }>) {
    const out: string[] = []
    for await (const c of iter) if (c.text) out.push(c.text)
    return out
}
/** 끊기 신호가 올 때까지 첫 글자를 안 내는 Gemini (신호가 오면 오류) */
function hangingGemini() {
    return (_s: string, _h: unknown, opts: { abortSignal?: AbortSignal }) => Promise.resolve((async function* () {
        await new Promise((_r, rej) => {
            if (opts.abortSignal?.aborted) rej(new Error('aborted'))
            opts.abortSignal?.addEventListener('abort', () => rej(new Error('aborted')))
        })
        yield { text: '안 나옴' }
    })())
}
async function* failsAtOnce(): AsyncGenerator<{ text: string }> {
    throw new Error('solar down')
}

const history: GeminiMessage[] = [{ role: 'user', parts: [{ text: '오늘 뉴스 찾아줘' }] }]

describe('chat/stream — Gemini 마감과 검색 실패 시 솔라', () => {
    beforeEach(() => {
        solarMock.mockReset()
        geminiMock.mockReset()
        vi.stubEnv('UPSTAGE_API_KEY', 'up')
        vi.stubEnv('GEMINI_API_KEY', 'gm')
        vi.stubEnv('LLM_DRIVER', '')
        vi.stubEnv('GEMINI_FIRST_TOKEN_MS', '30')
        vi.stubEnv('SOLAR_FIRST_TOKEN_TIMEOUT_MS', '30')
    })

    it('Gemini 를 부를 때 끊기 신호(abortSignal)를 넘긴다', async () => {
        geminiMock.mockResolvedValue(gen(['검색 답']))
        await collect(await generateChatStream('시스템', history, { webSearch: true }))
        const opts = geminiMock.mock.calls[0][2] as { abortSignal?: AbortSignal }
        expect(opts.abortSignal).toBeInstanceOf(AbortSignal)
    })

    it('검색 Gemini 가 첫 글자 마감까지 아무 말도 없으면 검색 없이 솔라가 답한다', async () => {
        geminiMock.mockImplementation(hangingGemini())
        solarMock.mockReturnValue(gen(['솔라 답']))
        const started = Date.now()
        const out = await collect(await generateChatStream('시스템', history, { webSearch: true }))
        expect(out).toEqual(['솔라 답'])
        expect(Date.now() - started).toBeLessThan(2000)
        expect(solarMock).toHaveBeenCalledTimes(1)
    })

    it('검색 Gemini 가 바로 죽어도 솔라가 답한다', async () => {
        geminiMock.mockRejectedValue(new Error('gemini 503'))
        solarMock.mockReturnValue(gen(['솔라']))
        const out = await collect(await generateChatStream('시스템', history, { webSearch: true }))
        expect(out).toEqual(['솔라'])
    })

    it('검색 Gemini 도 솔라도 죽으면 Gemini 를 또 부르지 않고 「쉬는 중」', async () => {
        geminiMock.mockRejectedValue(new Error('gemini 503'))
        solarMock.mockReturnValue(failsAtOnce())
        const out = await collect(await generateChatStream('시스템', history, { webSearch: true }))
        expect(out).toEqual([UNAVAILABLE_TEXT])
        expect(geminiMock).toHaveBeenCalledTimes(1)
    })

    it('솔라가 죽고 되돌아간 Gemini 가 첫 글자를 못 내면 마감 뒤 「쉬는 중」으로 끝난다(멈추지 않는다)', async () => {
        solarMock.mockReturnValue(failsAtOnce())
        geminiMock.mockImplementation(hangingGemini())
        const started = Date.now()
        const out = await collect(await generateChatStream('시스템', history))
        expect(out).toEqual([UNAVAILABLE_TEXT])
        expect(Date.now() - started).toBeLessThan(2000)
    })

    it('대화 마감(deadline)이 이미 지났으면 모델을 오래 기다리지 않는다', async () => {
        vi.stubEnv('GEMINI_FIRST_TOKEN_MS', '60000')
        vi.stubEnv('SOLAR_FIRST_TOKEN_TIMEOUT_MS', '0')
        solarMock.mockImplementation((_s: string, _m: unknown, o: { signal?: AbortSignal }) => (async function* () {
            await new Promise((_r, rej) => {
                if (o.signal?.aborted) rej(new Error('aborted'))
                o.signal?.addEventListener('abort', () => rej(new Error('aborted')))
            })
            yield { text: 'x' }
        })())
        geminiMock.mockImplementation(hangingGemini())
        const started = Date.now()
        const out = await collect(await generateChatStream('시스템', history, { deadline: Date.now() + 50 }))
        expect(out).toEqual([UNAVAILABLE_TEXT])
        expect(Date.now() - started).toBeLessThan(2000)
    })
})
