// domains/knowledge — Gemini 임베딩 생성

import { GoogleGenAI } from '@google/genai'
import { logLlmUsage } from '@/domains/llm/usage-log'
import type { UsageCtx } from '@/domains/llm/usage-log'
import { estimateTokensFromText } from '@/domains/llm/prices'

function getAI() {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
}

export const EMBEDDING_MODEL = 'gemini-embedding-001'

/**
 * 텍스트를 Gemini 임베딩 벡터로 변환
 * usage 를 주면 비용 기록(llm_usage)에 남긴다. 임베딩은 토큰 수를 안 돌려줘서 글자 수로 어림한다.
 */
export async function generateEmbedding(text: string, usage?: UsageCtx): Promise<number[]> {
    const started = Date.now()
    const log = (ok: boolean, error?: string) => logLlmUsage({
        route: usage?.route ?? 'unknown',
        userId: usage?.userId, mentorId: usage?.mentorId, channelId: usage?.channelId,
        kind: 'embedding', provider: 'gemini', model: EMBEDDING_MODEL,
        inputTokens: estimateTokensFromText(text), outputTokens: 0, tokensEstimated: true,
        latencyMs: Date.now() - started, ok, error,
    })
    try {
        const result = await getAI().models.embedContent({
            model: EMBEDDING_MODEL,
            contents: text,
            config: {
                outputDimensionality: 768,
            },
        })
        log(true)
        return result.embeddings?.[0]?.values || []
    } catch (e) {
        log(false, e instanceof Error ? e.message : String(e))
        throw e
    }
}

/**
 * 텍스트를 청크로 분할
 */
export function splitIntoChunks(text: string, maxChunkSize = 500): string[] {
    const paragraphs = text.split(/\n\n+/)
    const chunks: string[] = []
    let current = ''

    for (const para of paragraphs) {
        if ((current + '\n\n' + para).length > maxChunkSize && current) {
            chunks.push(current.trim())
            current = para
        } else {
            current = current ? current + '\n\n' + para : para
        }
    }

    if (current.trim()) {
        chunks.push(current.trim())
    }

    return chunks
}
