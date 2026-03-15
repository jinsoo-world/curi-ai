// /api/creator/knowledge/youtube — YouTube 자막 추출 + Gemini 정제 + 임베딩
// 자막 추출: Cloudflare Worker 프록시(YOUTUBE_PROXY_URL) 경유
// Vercel IP가 YouTube에 차단되어 직접 fetch 불가 → Worker가 대신 가져옴
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { generateEmbedding, splitIntoChunks } from '@/domains/knowledge/embedding'
import { GoogleGenAI } from '@google/genai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function extractVideoId(url: string): string | null {
    try {
        const u = new URL(url)
        if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null
        if (u.hostname.includes('youtube.com')) {
            const v = u.searchParams.get('v')
            if (v) return v
            const match = u.pathname.match(/\/(shorts|embed)\/([^/?]+)/)
            if (match) return match[2]
        }
        return null
    } catch { return null }
}

/**
 * Cloudflare Worker 프록시로 YouTube 자막 가져오기
 * Worker URL: YOUTUBE_PROXY_URL 환경변수 (예: https://youtube-proxy.xxx.workers.dev)
 * 요청: GET {WORKER_URL}/?v={videoId}
 * 응답: { text, lang, title, trackCount, textLength } 또는 { error }
 */
async function fetchTranscriptViaProxy(videoId: string): Promise<{ text: string; lang: string; title: string }> {
    const proxyUrl = process.env.YOUTUBE_PROXY_URL
    if (!proxyUrl) {
        console.error('[YouTube] YOUTUBE_PROXY_URL not set')
        throw new Error('CONFIG_ERROR')
    }

    const res = await fetch(`${proxyUrl}/?v=${videoId}`, {
        headers: { 'Accept': 'application/json' },
    })

    const data = await res.json()

    if (!res.ok || data.error) {
        console.error(`[YouTube] Proxy error: ${data.error} (HTTP ${res.status})`)
        if (data.error === 'CAPTCHA_BLOCKED') throw new Error('RATE_LIMITED')
        if (data.error === 'NO_CAPTIONS' || data.error === 'EMPTY_CAPTIONS') throw new Error('NO_TRANSCRIPT')
        throw new Error(data.error || 'PROXY_ERROR')
    }

    if (!data.text || data.text.length < 30) {
        throw new Error('NO_TRANSCRIPT')
    }

    console.log(`[YouTube] Proxy OK: ${data.textLength} chars, lang=${data.lang}, tracks=${data.trackCount}`)
    return { text: data.text, lang: data.lang, title: data.title }
}

/**
 * Gemini로 자막 정제 — 잡담/추임새 제거
 */
async function refineTranscriptWithGemini(rawText: string): Promise<string> {
    if (!process.env.GEMINI_API_KEY) return rawText
    try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
        const MAX = 10000

        const refine = async (chunk: string) => {
            const r = await ai.models.generateContent({
                model: 'gemini-2.0-flash-lite',
                contents: `다음 유튜브 자막에서 추임새(어, 음, 그니까), 유튜브 잡담(구독, 좋아요), 인사말을 제거하고 핵심 지식만 자연스러운 산문으로 정리해주세요. 의미를 변경하지 말고, 정제된 텍스트만 출력하세요.\n\n${chunk}`,
            })
            return r.text?.trim() || chunk
        }

        if (rawText.length <= MAX) {
            const refined = await refine(rawText)
            return refined.length > rawText.length * 0.3 ? refined : rawText
        }

        const chunks: string[] = []
        for (let i = 0; i < rawText.length; i += MAX) chunks.push(rawText.slice(i, i + MAX))
        const results: string[] = []
        for (const c of chunks) results.push(await refine(c))
        return results.join('\n\n')
    } catch (err) {
        console.error('[YouTube] Gemini error:', err instanceof Error ? err.message : err)
        return rawText
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

        const body = await req.json()
        const { url, mentorId, transcript: clientTranscript, title: clientTitle } = body

        if (!mentorId) return NextResponse.json({ error: '멘토 ID가 필요합니다.' }, { status: 400 })

        const videoId = url ? extractVideoId(url) : null

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 중복 확인
        if (videoId) {
            const { data: existing } = await admin
                .from('knowledge_sources').select('id')
                .eq('mentor_id', mentorId).like('original_url', `%${videoId}%`).limit(1)
            if (existing && existing.length > 0) {
                return NextResponse.json({ error: '이미 학습된 영상입니다.' }, { status: 409 })
            }
        }

        // 자막 텍스트 결정: 클라이언트 제공 > Worker 프록시
        let rawText: string
        let videoTitle: string

        if (clientTranscript && clientTranscript.length > 30) {
            rawText = clientTranscript
            videoTitle = clientTitle || 'YouTube 영상'
        } else if (videoId) {
            try {
                const result = await fetchTranscriptViaProxy(videoId)
                rawText = result.text
                videoTitle = result.title
            } catch (err) {
                const msg = err instanceof Error ? err.message : ''
                if (msg === 'CONFIG_ERROR') {
                    return NextResponse.json({ error: '유튜브 자막 프록시가 설정되지 않았습니다. 관리자에게 문의해주세요.' }, { status: 500 })
                }
                if (msg === 'RATE_LIMITED') {
                    return NextResponse.json({ error: '유튜브 서버 접근이 제한되고 있습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 })
                }
                return NextResponse.json({ error: '이 영상의 자막을 추출할 수 없습니다. 자막이 있는 영상을 사용해주세요.' }, { status: 400 })
            }
        } else {
            return NextResponse.json({ error: 'URL 또는 자막 텍스트가 필요합니다.' }, { status: 400 })
        }

        if (rawText.length < 30) {
            return NextResponse.json({ error: '자막 내용이 너무 짧습니다.' }, { status: 400 })
        }

        // knowledge_sources 레코드 생성
        const { data: source, error: insertErr } = await admin
            .from('knowledge_sources')
            .insert({
                mentor_id: mentorId,
                title: `🎥 ${videoTitle}`,
                source_type: 'text',
                original_url: url || '',
                processing_status: 'processing',
                file_size: rawText.length,
            })
            .select('id').single()

        if (insertErr || !source) {
            return NextResponse.json({ error: '학습 시작에 실패했습니다.' }, { status: 500 })
        }

        // Gemini 정제
        const refinedText = await refineTranscriptWithGemini(rawText)

        // 청크 + 임베딩
        const chunks = splitIntoChunks(refinedText)
        let ok = 0
        for (let i = 0; i < chunks.length; i++) {
            try {
                const emb = await generateEmbedding(chunks[i])
                if (!emb || emb.length === 0) continue
                await admin.from('knowledge_chunks').insert({
                    source_id: source.id, mentor_id: mentorId,
                    content: chunks[i], embedding: emb, chunk_index: i,
                })
                ok++
            } catch (e) {
                console.error(`[YouTube] Chunk ${i} fail:`, e instanceof Error ? e.message : e)
            }
        }

        await admin.from('knowledge_sources').update({
            processing_status: 'completed', chunk_count: ok,
            content: refinedText, file_size: refinedText.length,
        }).eq('id', source.id)

        return NextResponse.json({
            success: true, title: videoTitle,
            chunksProcessed: ok, totalChunks: chunks.length,
            totalCharacters: refinedText.length,
        })
    } catch (error) {
        console.error('[YouTube API] Error:', error)
        return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 })
    }
}
