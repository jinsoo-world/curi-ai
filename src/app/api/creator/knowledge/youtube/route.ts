// /api/creator/knowledge/youtube — 프론트에서 추출한 자막 텍스트를 받아서 정제 + 임베딩 + DB 저장
// 자막 추출은 클라이언트(브라우저)에서 CORS 프록시 경유로 처리
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { generateEmbedding, splitIntoChunks } from '@/domains/knowledge/embedding'
import { GoogleGenAI } from '@google/genai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Gemini로 자막 텍스트 정제 — 잡담/추임새/인사말 제거
 */
async function refineTranscriptWithGemini(rawText: string): Promise<string> {
    if (!process.env.GEMINI_API_KEY) return rawText

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
        const MAX_CHUNK = 10000

        const refineChunk = async (chunk: string): Promise<string> => {
            const result = await ai.models.generateContent({
                model: 'gemini-2.0-flash-lite',
                contents: `다음은 유튜브 영상에서 추출한 자막 텍스트입니다.

규칙:
1. "어...", "음...", "그니까", "네네", "아아" 같은 추임새와 말더듬을 모두 제거하세요.
2. "구독과 좋아요 부탁드려요", "채널 구독해주세요", "링크는 설명란에" 같은 유튜브 잡담을 제거하세요.
3. 인사말("안녕하세요 여러분", "오늘 영상은") 같은 도입부 잡담을 제거하세요.
4. 핵심 지식과 정보만 자연스러운 산문으로 정리해주세요.
5. 원래 내용의 의미를 절대 변경하거나 새로운 내용을 추가하지 마세요.
6. 정제된 텍스트만 출력하세요, 설명이나 주석은 붙이지 마세요.

자막 텍스트:
${chunk}`,
            })
            return result.text?.trim() || chunk
        }

        if (rawText.length <= MAX_CHUNK) {
            const refined = await refineChunk(rawText)
            if (refined.length > rawText.length * 0.3) {
                console.log(`[YouTube] Gemini: ${rawText.length} → ${refined.length} chars`)
                return refined
            }
            return rawText
        }

        // 긴 텍스트는 청크별 정제
        const chunks: string[] = []
        for (let i = 0; i < rawText.length; i += MAX_CHUNK) {
            chunks.push(rawText.slice(i, i + MAX_CHUNK))
        }

        const refined: string[] = []
        for (const chunk of chunks) {
            refined.push(await refineChunk(chunk))
        }
        return refined.join('\n\n')
    } catch (err) {
        console.error('[YouTube] Gemini error:', err instanceof Error ? err.message : err)
        return rawText
    }
}

export async function POST(req: NextRequest) {
    try {
        // 인증 확인
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

        // 프론트에서 보낸 데이터: url, mentorId, transcript(자막 텍스트), title(영상 제목)
        const { url, mentorId, transcript, title } = await req.json()

        if (!mentorId || !transcript) {
            return NextResponse.json({ error: '멘토 ID와 자막 텍스트가 필요합니다.' }, { status: 400 })
        }
        if (transcript.length < 30) {
            return NextResponse.json({ error: '자막 내용이 너무 짧습니다.' }, { status: 400 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 중복 확인 (URL 기반)
        if (url) {
            const videoIdMatch = url.match(/(?:v=|youtu\.be\/|shorts\/)([^&?/\s]{11})/)
            const videoId = videoIdMatch?.[1]
            if (videoId) {
                const { data: existing } = await admin
                    .from('knowledge_sources')
                    .select('id')
                    .eq('mentor_id', mentorId)
                    .like('original_url', `%${videoId}%`)
                    .limit(1)

                if (existing && existing.length > 0) {
                    return NextResponse.json({ error: '이미 학습된 영상입니다.' }, { status: 409 })
                }
            }
        }

        // knowledge_sources 레코드 생성
        const { data: source, error: insertErr } = await admin
            .from('knowledge_sources')
            .insert({
                mentor_id: mentorId,
                title: `🎥 ${title || 'YouTube 영상'}`,
                source_type: 'text',
                original_url: url || '',
                processing_status: 'processing',
                file_size: transcript.length,
            })
            .select('id')
            .single()

        if (insertErr || !source) {
            console.error('[YouTube] Insert error:', insertErr?.message)
            return NextResponse.json({ error: `학습 시작에 실패했습니다.` }, { status: 500 })
        }

        // ═══ Step 1: Gemini로 자막 정제 ═══
        console.log(`[YouTube] Refining transcript: ${transcript.length} chars`)
        const refinedText = await refineTranscriptWithGemini(transcript)
        console.log(`[YouTube] Refined: ${transcript.length} → ${refinedText.length} chars`)

        // ═══ Step 2: 청크 분할 + 임베딩 ═══
        const chunks = splitIntoChunks(refinedText)
        console.log(`[YouTube] Chunks: ${chunks.length}`)
        let successCount = 0

        for (let i = 0; i < chunks.length; i++) {
            try {
                const embedding = await generateEmbedding(chunks[i])
                if (!embedding || embedding.length === 0) continue
                await admin.from('knowledge_chunks').insert({
                    source_id: source.id,
                    mentor_id: mentorId,
                    content: chunks[i],
                    embedding,
                    chunk_index: i,
                })
                successCount++
            } catch (embErr) {
                console.error(`[YouTube] Chunk ${i} failed:`, embErr instanceof Error ? embErr.message : embErr)
            }
        }

        // ═══ 완료 ═══
        await admin.from('knowledge_sources')
            .update({
                processing_status: 'completed',
                chunk_count: successCount,
                content: refinedText,
                file_size: refinedText.length,
            })
            .eq('id', source.id)

        console.log(`[YouTube] Done: ${successCount}/${chunks.length} chunks`)

        return NextResponse.json({
            success: true,
            title: title || 'YouTube 영상',
            chunksProcessed: successCount,
            totalChunks: chunks.length,
            totalCharacters: refinedText.length,
        })
    } catch (error: unknown) {
        console.error('[YouTube API] Error:', error)
        return NextResponse.json({
            error: '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        }, { status: 500 })
    }
}
