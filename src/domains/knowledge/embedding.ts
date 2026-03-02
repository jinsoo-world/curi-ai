// domains/knowledge — Gemini 임베딩 생성

import { GoogleGenAI } from '@google/genai'

function getAI() {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
}

/**
 * 텍스트를 Gemini 임베딩 벡터로 변환
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const result = await getAI().models.embedContent({
        model: 'gemini-embedding-exp-03-07',
        contents: text,
        config: {
            outputDimensionality: 768,
        },
    })

    return result.embeddings?.[0]?.values || []
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
