// /api/creator/knowledge/youtube — YouTube 자막 추출 + Gemini 정제 + 임베딩
// 핵심: CONSENT 쿠키를 넣어야 YouTube가 동의 페이지 대신 실제 페이지를 반환함
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

function decodeEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
}

/**
 * YouTube 페이지에서 captionTracks 추출
 * 핵심: CONSENT 쿠키를 포함해야 동의 페이지가 아닌 실제 페이지를 받음
 */
async function getCaptionTracks(videoId: string): Promise<Array<{ baseUrl: string; languageCode: string; name: string }>> {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Cookie': 'CONSENT=PENDING+987; SOCS=CAESEwgDEgk1OTg1NzA0MDAaAmVuIAEaBgiA_LyaBg',
        },
    })

    if (!res.ok) {
        console.error(`[YouTube] Page fetch failed: HTTP ${res.status}`)
        throw new Error('FETCH_FAILED')
    }

    const html = await res.text()
    console.log(`[YouTube] Page HTML: ${html.length} chars`)

    if (html.includes('class="g-recaptcha"')) {
        console.error('[YouTube] CAPTCHA detected')
        throw new Error('RATE_LIMITED')
    }

    // captionTracks JSON 추출 (정규식)
    const match = html.match(/"captionTracks":(\[.*?\])/)
    if (!match) {
        console.log('[YouTube] No captionTracks found in page')
        throw new Error('NO_TRANSCRIPT')
    }

    try {
        const tracks = JSON.parse(match[1])
        if (!Array.isArray(tracks) || tracks.length === 0) {
            throw new Error('NO_TRANSCRIPT')
        }
        console.log(`[YouTube] Found ${tracks.length} caption tracks`)
        return tracks.map((t: { baseUrl: string; languageCode: string; name?: { simpleText?: string } }) => ({
            baseUrl: t.baseUrl,
            languageCode: t.languageCode,
            name: t.name?.simpleText || t.languageCode,
        }))
    } catch {
        console.error('[YouTube] captionTracks JSON parse failed')
        throw new Error('NO_TRANSCRIPT')
    }
}

/**
 * 자막 트랙 URL에서 텍스트 추출
 */
async function fetchTranscriptText(baseUrl: string): Promise<string> {
    const res = await fetch(baseUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        },
    })
    if (!res.ok) throw new Error(`Transcript XML fetch failed: ${res.status}`)
    const xml = await res.text()

    const texts: string[] = []
    const regex = /<text[^>]*>([\s\S]*?)<\/text>/g
    let m
    while ((m = regex.exec(xml)) !== null) {
        const t = decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim()
        if (t) texts.push(t)
    }

    // 폴백: <p> 형식
    if (texts.length === 0) {
        const pRegex = /<p\s[^>]*>([\s\S]*?)<\/p>/g
        while ((m = pRegex.exec(xml)) !== null) {
            const inner = m[1]
            const cleaned = inner.replace(/<[^>]+>/g, '')
            const t = decodeEntities(cleaned).trim()
            if (t) texts.push(t)
        }
    }

    return texts.join(' ')
}

/**
 * YouTube 자막 가져오기 — CONSENT 쿠키로 페이지 접근 + captionTracks 활용
 */
async function fetchTranscript(videoId: string): Promise<{ text: string; lang: string }> {
    const tracks = await getCaptionTracks(videoId)

    // 한국어 → 영어 → 첫 번째 우선
    const preferred = tracks.find(t => t.languageCode === 'ko')
        || tracks.find(t => t.languageCode === 'en')
        || tracks[0]

    console.log(`[YouTube] Using track: ${preferred.languageCode} (${preferred.name})`)

    const rawText = await fetchTranscriptText(preferred.baseUrl)
    const cleaned = rawText
        .replace(/\[음악\]/g, '').replace(/\[Music\]/g, '')
        .replace(/\[박수\]/g, '').replace(/\[Applause\]/g, '')
        .replace(/\s+/g, ' ').trim()

    if (!cleaned || cleaned.length < 30) {
        throw new Error('NO_TRANSCRIPT')
    }

    console.log(`[YouTube] Transcript: ${cleaned.length} chars (${preferred.languageCode})`)
    return { text: cleaned, lang: preferred.languageCode }
}

/**
 * YouTube 영상 제목 가져오기
 */
async function fetchVideoTitle(videoId: string): Promise<string> {
    try {
        const res = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`)
        if (res.ok) {
            const data = await res.json()
            return data.title || `YouTube 영상 (${videoId})`
        }
    } catch { /* ignore */ }
    return `YouTube 영상 (${videoId})`
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

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 서버에서 자막 추출 또는 프론트에서 보낸 자막 사용
        let rawText: string
        let videoTitle: string

        if (clientTranscript && clientTranscript.length > 30) {
            // 프론트에서 추출한 자막이 있으면 그대로 사용
            rawText = clientTranscript
            videoTitle = clientTitle || 'YouTube 영상'
            console.log(`[YouTube] Using client-provided transcript: ${rawText.length} chars`)
        } else if (url) {
            // 프론트 추출 실패 시 서버에서 직접 추출 (CONSENT 쿠키 방식)
            const videoId = extractVideoId(url)
            if (!videoId) return NextResponse.json({ error: '올바른 YouTube URL을 입력해주세요.' }, { status: 400 })

            // 중복 확인
            const { data: existing } = await admin
                .from('knowledge_sources').select('id')
                .eq('mentor_id', mentorId).like('original_url', `%${videoId}%`).limit(1)
            if (existing && existing.length > 0) {
                return NextResponse.json({ error: '이미 학습된 영상입니다.' }, { status: 409 })
            }

            videoTitle = await fetchVideoTitle(videoId)

            try {
                const result = await fetchTranscript(videoId)
                rawText = result.text
            } catch (err) {
                const msg = err instanceof Error ? err.message : ''
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
        console.log(`[YouTube] Refined: ${rawText.length} → ${refinedText.length}`)

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
