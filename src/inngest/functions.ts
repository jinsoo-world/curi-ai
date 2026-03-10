/**
 * Inngest 함수 — 문서 파싱 + 임베딩
 * 큐리 AI — Upstage Document Parse → Semantic Chunking → pgvector 저장
 */

import { inngest } from './client'

/** 이벤트 타입 정의 */
type DocumentParseEvent = {
    data: {
        mentor_id: string
        file_url: string       // Supabase Storage URL
        file_name: string
        file_type: string      // 'hwp' | 'pdf' | 'docx'
        user_id: string
    }
}

/**
 * 문서 파싱 + 임베딩 함수
 * 1) Upstage Document Parse API 호출
 * 2) 마크다운 → Semantic Chunking
 * 3) Embedding → pgvector 저장
 */
export const parseAndEmbedDocument = inngest.createFunction(
    {
        id: 'parse-and-embed-document',
        name: '문서 파싱 및 임베딩',
        retries: 3,
    },
    { event: 'document/parse' },
    async ({ event, step }) => {
        const { mentor_id, file_url, file_name, file_type, user_id } = event.data as DocumentParseEvent['data']

        // Step 1: Upstage Document Parse 호출
        const markdown = await step.run('parse-document', async () => {
            const response = await fetch(file_url)
            const fileBlob = await response.blob()

            const formData = new FormData()
            formData.append('document', fileBlob, file_name)
            formData.append('output_format', 'markdown')

            const upstageResponse = await fetch(
                'https://api.upstage.ai/v1/document-ai/document-parse',
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.UPSTAGE_API_KEY}`,
                    },
                    body: formData,
                }
            )

            if (!upstageResponse.ok) {
                const errorText = await upstageResponse.text()
                throw new Error(`Upstage API error: ${upstageResponse.status} - ${errorText}`)
            }

            const result = await upstageResponse.json()
            return result.content?.markdown || result.text || ''
        })

        if (!markdown || markdown.trim().length === 0) {
            throw new Error('파싱 결과가 비어있습니다.')
        }

        // Step 2: Semantic Chunking
        const chunks = await step.run('chunk-document', async () => {
            return semanticChunk(markdown, {
                maxChunkSize: 1000,
                minChunkSize: 200,
                overlap: 50,
            })
        })

        // Step 3: Embedding → pgvector 저장
        const savedCount = await step.run('embed-and-save', async () => {
            const { createAdminClient } = await import('@/lib/supabase/admin')
            const supabase = createAdminClient()

            let saved = 0
            for (const chunk of chunks) {
                // Gemini Embedding API 호출
                const embeddingResponse = await fetch(
                    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GEMINI_API_KEY}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: 'models/text-embedding-004',
                            content: { parts: [{ text: chunk.text }] },
                        }),
                    }
                )

                if (!embeddingResponse.ok) {
                    console.error('Embedding API error:', await embeddingResponse.text())
                    continue
                }

                const embeddingResult = await embeddingResponse.json()
                const embedding = embeddingResult.embedding?.values

                if (!embedding) continue

                // pgvector에 저장
                const { error } = await supabase
                    .from('mentor_knowledge')
                    .insert({
                        mentor_id,
                        content: chunk.text,
                        embedding,
                        metadata: {
                            source: file_name,
                            chunk_index: chunk.index,
                            total_chunks: chunks.length,
                        },
                    })

                if (error) {
                    console.error('Knowledge insert error:', error)
                } else {
                    saved++
                }
            }

            return saved
        })

        // Step 4: 슬랙 알림 (선택)
        await step.run('notify-completion', async () => {
            const webhookUrl = process.env.SLACK_WEBHOOK_URL
            if (!webhookUrl) return

            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: `📄 문서 파싱 완료!\n파일: ${file_name}\n멘토: ${mentor_id}\n청크: ${chunks.length}개 → 저장: ${savedCount}개`,
                }),
            })
        })

        return {
            success: true,
            file_name,
            total_chunks: chunks.length,
            saved_chunks: savedCount,
        }
    }
)

/**
 * Semantic Chunking
 * 마크다운을 Heading/빈줄 기준으로 의미 단위로 분할
 */
function semanticChunk(
    text: string,
    options: { maxChunkSize: number; minChunkSize: number; overlap: number }
): { text: string; index: number }[] {
    const { maxChunkSize, minChunkSize, overlap } = options

    // 1차: Heading 기준 분할
    const sections = text.split(/(?=^#{1,3}\s)/m)

    const chunks: { text: string; index: number }[] = []
    let currentChunk = ''
    let chunkIndex = 0

    for (const section of sections) {
        const trimmed = section.trim()
        if (!trimmed) continue

        if (currentChunk.length + trimmed.length > maxChunkSize && currentChunk.length >= minChunkSize) {
            // 현재 청크 저장
            chunks.push({ text: currentChunk.trim(), index: chunkIndex++ })

            // 오버랩: 마지막 문장 일부 유지
            const lastParagraph = currentChunk.slice(-overlap)
            currentChunk = lastParagraph + '\n\n' + trimmed
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + trimmed
        }
    }

    // 마지막 청크
    if (currentChunk.trim().length >= minChunkSize) {
        chunks.push({ text: currentChunk.trim(), index: chunkIndex++ })
    } else if (chunks.length > 0) {
        // 마지막 청크가 너무 작으면 이전 청크에 합침
        chunks[chunks.length - 1].text += '\n\n' + currentChunk.trim()
    } else {
        // 전체가 하나의 작은 청크
        chunks.push({ text: currentChunk.trim(), index: 0 })
    }

    return chunks
}
