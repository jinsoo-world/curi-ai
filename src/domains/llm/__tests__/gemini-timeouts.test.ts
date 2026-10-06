import { describe, it, expect, vi, beforeEach } from 'vitest'

// 2026-10-06 멈춤 점검: 임베딩(대화 3초)·곁일(8초)에도 Gemini 마감을 건다
const embedContent = vi.fn()
const generateContent = vi.fn()
vi.mock('@google/genai', () => ({
    GoogleGenAI: class { models = { embedContent: (...a: unknown[]) => embedContent(...a), generateContent: (...a: unknown[]) => generateContent(...a) } },
}))

import { generateEmbedding, EMBEDDING_CHAT_TIMEOUT_MS, EMBEDDING_TIMEOUT_MS } from '@/domains/knowledge/embedding'
import { askSideText, SIDE_TEXT_GEMINI_TIMEOUT_MS } from '../side-text'

/** 끊기 신호가 오면 실패하는 가짜 호출 */
function hangUntilAbort(req: { config?: { abortSignal?: AbortSignal } }) {
    return new Promise((_r, rej) => {
        const s = req.config?.abortSignal
        if (s?.aborted) rej(new Error('aborted'))
        s?.addEventListener('abort', () => rej(new Error('aborted')))
    })
}

describe('Gemini 마감 — 임베딩·곁일', () => {
    beforeEach(() => {
        embedContent.mockReset()
        generateContent.mockReset()
        vi.stubEnv('GEMINI_API_KEY', 'gm')
        vi.stubEnv('SIDE_TEXT_PROVIDER', 'gemini')
    })

    it('마감 값: 대화 임베딩 3초, 기본(파일 학습) 은 더 길게, 곁일 8초', () => {
        expect(EMBEDDING_CHAT_TIMEOUT_MS).toBe(3_000)
        expect(EMBEDDING_TIMEOUT_MS).toBeGreaterThan(EMBEDDING_CHAT_TIMEOUT_MS)
        expect(SIDE_TEXT_GEMINI_TIMEOUT_MS).toBe(8_000)
    })

    it('임베딩에 끊기 신호를 넘기고, 마감이 지나면 던진다(멈추지 않는다)', async () => {
        embedContent.mockImplementation(hangUntilAbort)
        const started = Date.now()
        await expect(generateEmbedding('질문', undefined, { timeoutMs: 30 })).rejects.toThrow()
        expect(Date.now() - started).toBeLessThan(1000)
        expect(embedContent.mock.calls[0][0].config.abortSignal).toBeInstanceOf(AbortSignal)
    })

    it('임베딩 제때 오면 벡터를 돌려준다', async () => {
        embedContent.mockResolvedValue({ embeddings: [{ values: [1, 2] }] })
        await expect(generateEmbedding('질문')).resolves.toEqual([1, 2])
    })

    it('곁일 Gemini 가 마감을 넘기면 던지고(호출 쪽이 넘어간다) 끊기 신호를 넘긴다', async () => {
        generateContent.mockImplementation(hangUntilAbort)
        const started = Date.now()
        await expect(askSideText({ kind: 'topic', route: 't', prompt: 'p', geminiModel: 'm', geminiTimeoutMs: 30 })).rejects.toThrow()
        expect(Date.now() - started).toBeLessThan(1000)
        expect(generateContent.mock.calls[0][0].config.abortSignal).toBeInstanceOf(AbortSignal)
    })
})

describe('곁일 마감 — 긴 일은 솔라 마감만큼 기다린다', () => {
    it('solarTimeoutMs 를 길게 준 일은 Gemini 도 그만큼 (요약·초안이 8초에 잘리지 않게)', async () => {
        vi.stubEnv('GEMINI_API_KEY', 'gm')
        vi.stubEnv('SIDE_TEXT_PROVIDER', 'gemini')
        generateContent.mockReset()
        generateContent.mockImplementation(async (req: { config: { abortSignal: AbortSignal } }) => {
            await new Promise(r => setTimeout(r, 60))
            return { text: req.config.abortSignal.aborted ? '' : '끝까지 기다림', usageMetadata: {} }
        })
        const out = await askSideText({ kind: 'summary', route: 't', prompt: 'p', geminiModel: 'm', solarTimeoutMs: 30_000 })
        expect(out).toBe('끝까지 기다림')
    })
})
