// domains/chat — 대화 답을 흘려주는 입구 (드라이버 선택 + 되돌아가기)
//
// 대화 API(/api/chat)는 이 함수 하나만 부른다. 여기서
//  1. 어느 모델로 답할지 고르고 (domains/llm/driver)
//  2. 솔라가 첫 글자도 못 내고 죽으면 Gemini 로 되돌아가고
//  3. 둘 다 죽으면 오류 대신 「쉬는 중」 한 줄을 내놓는다 (전체가 죽지 않는다)
//
// 화면 쪽 약속 = chunk.text 만 본다. 그 모양은 바꾸지 않았다.

import { generateChatStream as generateGeminiStream } from './gemini'
import { geminiToOpenAi, pickDriverFromEnv, solarChatStream, SOLAR_CHAT_MODEL } from '@/domains/llm'
import type { LlmChunk } from '@/domains/llm'
import type { GeminiMessage } from './types'

import { UNAVAILABLE_TEXT } from './constants'
export { UNAVAILABLE_TEXT }

type TextChunk = { text?: string }

/** 답변 설정(domains/os/response-settings) 이 계산해 넘기는 길이·최신성 조정. 안 주면 기존 동작 그대로 */
export interface ChatStreamOptions {
    /** Length 설정에서 계산한 답 길이 상한(토큰) */
    maxOutputTokens?: number
    /** false 면 Gemini 의 구글 검색 도구를 끈다(솔라는 애초에 검색 도구가 없다) */
    recencyOn?: boolean
}

/**
 * 솔라 → (실패 시) Gemini → (또 실패 시) 쉬는 중.
 * 되돌아가기는 「첫 조각이 오기 전」에만 한다. 답을 하다 끊긴 건 그대로 끝낸다
 * (반쪽 답 뒤에 다른 모델의 답을 이어 붙이면 사람이 더 헷갈린다).
 */
async function* solarWithFallback(
    systemPrompt: string,
    history: GeminiMessage[],
    opts: ChatStreamOptions = {},
): AsyncGenerator<TextChunk> {
    const { messages } = geminiToOpenAi(systemPrompt, history)
    const started = Date.now()
    let firstChunkSeen = false
    let usage: LlmChunk['usage'] = null

    try {
        for await (const chunk of solarChatStream('', messages, { maxTokens: opts.maxOutputTokens })) {
            if (chunk.text) {
                firstChunkSeen = true
                yield { text: chunk.text }
            }
            if (chunk.done) usage = chunk.usage
        }
        console.log(`[LLM] driver=solar model=${SOLAR_CHAT_MODEL} ms=${Date.now() - started} prompt=${usage?.prompt ?? '?'} completion=${usage?.completion ?? '?'}`)
        return
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (firstChunkSeen) {
            // 답하다 끊김. 나온 글은 살리고 조용히 끝낸다
            console.error(`[LLM] solar cut mid-stream after ${Date.now() - started}ms: ${msg}`)
            return
        }
        console.error(`[LLM] solar failed before first token, falling back to gemini: ${msg}`)
    }

    // 되돌아가기
    if (!process.env.GEMINI_API_KEY) {
        yield { text: UNAVAILABLE_TEXT }
        return
    }
    try {
        const gemini = await generateGeminiStream(systemPrompt, history, opts)
        for await (const chunk of gemini) yield { text: chunk.text || '' }
        console.log(`[LLM] driver=gemini(fallback) ms=${Date.now() - started}`)
    } catch (err) {
        console.error(`[LLM] gemini fallback failed too: ${err instanceof Error ? err.message : err}`)
        yield { text: UNAVAILABLE_TEXT }
    }
}

async function* geminiOnly(systemPrompt: string, history: GeminiMessage[], opts: ChatStreamOptions = {}): AsyncGenerator<TextChunk> {
    try {
        const gemini = await generateGeminiStream(systemPrompt, history, opts)
        for await (const chunk of gemini) yield { text: chunk.text || '' }
    } catch (err) {
        console.error(`[LLM] gemini failed: ${err instanceof Error ? err.message : err}`)
        yield { text: UNAVAILABLE_TEXT }
    }
}

async function* unavailable(): AsyncGenerator<TextChunk> {
    yield { text: UNAVAILABLE_TEXT }
}

/**
 * 대화 답 스트림. 반환 모양은 예전 Gemini 직접 호출과 같다(for await … chunk.text).
 * opts(길이·최신성)는 답변 설정(domains/os/response-settings)이 계산해 넘긴다. 안 주면 기존 동작 그대로.
 */
export async function generateChatStream(
    systemPrompt: string,
    history: GeminiMessage[],
    opts: ChatStreamOptions = {},
): Promise<AsyncIterable<TextChunk>> {
    const { hasImage } = geminiToOpenAi('', history)
    const driver = pickDriverFromEnv(hasImage)
    if (driver === 'solar') return solarWithFallback(systemPrompt, history, opts)
    if (driver === 'gemini') return geminiOnly(systemPrompt, history, opts)
    console.error('[LLM] no driver available (no UPSTAGE_API_KEY, no GEMINI_API_KEY)')
    return unavailable()
}
