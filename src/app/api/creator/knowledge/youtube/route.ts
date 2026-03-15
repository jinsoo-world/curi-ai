// /api/creator/knowledge/youtube — YouTube URL에서 자막 추출 + 임베딩
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { generateEmbedding, splitIntoChunks } from '@/domains/knowledge/embedding'
import { YoutubeTranscript } from 'youtube-transcript'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * YouTube URL에서 videoId 추출
 * 지원 형식: youtube.com/watch?v=xxx, youtu.be/xxx, youtube.com/shorts/xxx
 */
function extractVideoId(url: string): string | null {
    try {
        const u = new URL(url)
        if (u.hostname.includes('youtu.be')) {
            return u.pathname.slice(1).split('/')[0] || null
        }
        if (u.hostname.includes('youtube.com')) {
            // /watch?v=xxx
            const v = u.searchParams.get('v')
            if (v) return v
            // /shorts/xxx or /embed/xxx
            const match = u.pathname.match(/\/(shorts|embed)\/([^/?]+)/)
            if (match) return match[2]
        }
        return null
    } catch {
        return null
    }
}

/**
 * YouTube 영상 자막 가져오기 + 텍스트 정리
 */
async function fetchTranscript(videoId: string): Promise<{ text: string; lang: string }> {
    // 한국어 자막 우선, 없으면 영어, 없으면 자동생성 자막
    const langs = ['ko', 'en']
    
    for (const lang of langs) {
        try {
            const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang })
            if (transcript && transcript.length > 0) {
                const text = transcript
                    .map(t => t.text)
                    .join(' ')
                    .replace(/\[음악\]/g, '')
                    .replace(/\[Music\]/g, '')
                    .replace(/\[박수\]/g, '')
                    .replace(/\[Applause\]/g, '')
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&#39;/g, "'")
                    .replace(/&quot;/g, '"')
                    .replace(/\s+/g, ' ')
                    .trim()
                return { text, lang }
            }
        } catch {
            continue
        }
    }

    // 언어 지정 없이 시도 (자동생성 자막 포함)
    try {
        const transcript = await YoutubeTranscript.fetchTranscript(videoId)
        if (transcript && transcript.length > 0) {
            const text = transcript
                .map(t => t.text)
                .join(' ')
                .replace(/\[음악\]/g, '')
                .replace(/\[Music\]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
            return { text, lang: 'auto' }
        }
    } catch {
        // fall through
    }

    throw new Error('이 영상에는 자막이 없어 학습할 수 없습니다.')
}

/**
 * YouTube oEmbed API로 영상 제목 가져오기
 */
async function fetchVideoTitle(videoId: string): Promise<string> {
    try {
        const res = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`)
        if (res.ok) {
            const data = await res.json()
            return data.title || `YouTube 영상 (${videoId})`
        }
    } catch {
        // ignore
    }
    return `YouTube 영상 (${videoId})`
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

        const { url, mentorId } = await req.json()

        if (!url || !mentorId) {
            return NextResponse.json({ error: 'URL과 멘토 ID가 필요합니다.' }, { status: 400 })
        }

        // 1. videoId 추출
        const videoId = extractVideoId(url)
        if (!videoId) {
            return NextResponse.json({ error: '올바른 YouTube URL을 입력해주세요.' }, { status: 400 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 2. 중복 확인
        const { data: existing } = await admin
            .from('knowledge_sources')
            .select('id')
            .eq('mentor_id', mentorId)
            .eq('source_type', 'youtube')
            .like('original_url', `%${videoId}%`)
            .limit(1)

        if (existing && existing.length > 0) {
            return NextResponse.json({ error: '이미 학습된 영상입니다.' }, { status: 409 })
        }

        // 3. 영상 제목 가져오기
        const title = await fetchVideoTitle(videoId)

        // 4. knowledge_sources에 레코드 삽입 (processing)
        const { data: source, error: insertErr } = await admin
            .from('knowledge_sources')
            .insert({
                mentor_id: mentorId,
                title: `🎥 ${title}`,
                source_type: 'youtube',
                original_url: url,
                processing_status: 'processing',
                file_size: 0,
            })
            .select('id')
            .single()

        if (insertErr || !source) {
            console.error('[YouTube] Insert error:', insertErr)
            return NextResponse.json({ error: '학습 시작에 실패했습니다.' }, { status: 500 })
        }

        // 5. 자막 추출
        let transcriptText: string
        try {
            const result = await fetchTranscript(videoId)
            transcriptText = result.text
            console.log(`[YouTube] Transcript fetched: ${transcriptText.length} chars, lang: ${result.lang}`)
        } catch (err) {
            await admin.from('knowledge_sources')
                .update({ processing_status: 'failed' })
                .eq('id', source.id)
            const message = err instanceof Error ? err.message : '자막 추출 실패'
            return NextResponse.json({ error: message }, { status: 400 })
        }

        // 자막이 너무 짧은 경우
        if (transcriptText.length < 50) {
            await admin.from('knowledge_sources')
                .update({ processing_status: 'failed' })
                .eq('id', source.id)
            return NextResponse.json({ error: '영상 내용이 너무 짧아 학습에 적합하지 않습니다.' }, { status: 400 })
        }

        // 6. 텍스트 → 청크 → 임베딩
        const chunks = splitIntoChunks(transcriptText)
        console.log(`[YouTube] Text: ${transcriptText.length}chars → ${chunks.length} chunks`)
        let successCount = 0

        for (let i = 0; i < chunks.length; i++) {
            try {
                const embedding = await generateEmbedding(chunks[i])
                if (!embedding || embedding.length === 0) {
                    console.error(`[YouTube] Chunk ${i}: empty embedding`)
                    continue
                }
                await admin.from('knowledge_chunks').insert({
                    source_id: source.id,
                    mentor_id: mentorId,
                    content: chunks[i],
                    embedding,
                    chunk_index: i,
                })
                successCount++
            } catch (embErr) {
                console.error(`[YouTube] Chunk ${i}/${chunks.length} failed:`, embErr instanceof Error ? embErr.message : embErr)
            }
        }
        console.log(`[YouTube] Embedding: ${successCount}/${chunks.length} chunks OK`)

        // 7. 처리 완료 업데이트
        await admin.from('knowledge_sources')
            .update({
                processing_status: 'completed',
                chunk_count: successCount,
                content: transcriptText,
                file_size: transcriptText.length,
            })
            .eq('id', source.id)

        return NextResponse.json({
            success: true,
            title,
            chunksProcessed: successCount,
            totalChunks: chunks.length,
            totalCharacters: transcriptText.length,
        })
    } catch (error: unknown) {
        console.error('[YouTube API] Error:', error)
        const message = error instanceof Error ? error.message : '처리 중 오류'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
