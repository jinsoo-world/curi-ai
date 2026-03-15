// /api/creator/knowledge/youtube — YouTube URL에서 자막 추출 + LLM 정제 + 임베딩
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { generateEmbedding, splitIntoChunks } from '@/domains/knowledge/embedding'
import { GoogleGenAI } from '@google/genai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * YouTube URL에서 videoId 추출
 * 지원: youtube.com/watch?v=xxx, youtu.be/xxx, youtube.com/shorts/xxx
 */
function extractVideoId(url: string): string | null {
    try {
        const u = new URL(url)
        if (u.hostname.includes('youtu.be')) {
            return u.pathname.slice(1).split('/')[0] || null
        }
        if (u.hostname.includes('youtube.com')) {
            const v = u.searchParams.get('v')
            if (v) return v
            const match = u.pathname.match(/\/(shorts|embed)\/([^/?]+)/)
            if (match) return match[2]
        }
        return null
    } catch {
        return null
    }
}

// HTML 엔티티 디코딩
function decodeEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
}

/**
 * YouTube InnerTube API로 자막 트랙 목록 가져오기
 * youtube-transcript 패키지 대신 직접 호출 (서버 IP 차단 우회)
 */
async function getCaptionTracks(videoId: string): Promise<Array<{ baseUrl: string; languageCode: string; name: string }>> {
    // Method 1: InnerTube API (Android 클라이언트 — IP 차단 우회 효과)
    try {
        const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'com.google.android.youtube/19.29.37 (Linux; U; Android 14)',
            },
            body: JSON.stringify({
                context: {
                    client: {
                        clientName: 'ANDROID',
                        clientVersion: '19.29.37',
                    },
                },
                videoId,
            }),
        })

        if (res.ok) {
            const data = await res.json()
            const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks
            if (Array.isArray(tracks) && tracks.length > 0) {
                console.log(`[YouTube] InnerTube: found ${tracks.length} caption tracks`)
                return tracks.map((t: { baseUrl: string; languageCode: string; name?: { simpleText?: string } }) => ({
                    baseUrl: t.baseUrl,
                    languageCode: t.languageCode,
                    name: t.name?.simpleText || t.languageCode,
                }))
            }
            console.log('[YouTube] InnerTube: no caption tracks found')
        } else {
            console.log(`[YouTube] InnerTube: HTTP ${res.status}`)
        }
    } catch (err) {
        console.error('[YouTube] InnerTube error:', err instanceof Error ? err.message : err)
    }

    // Method 2: 웹 페이지에서 파싱
    try {
        const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            },
        })
        const html = await res.text()

        // captcha 체크
        if (html.includes('class="g-recaptcha"')) {
            console.error('[YouTube] CAPTCHA detected! Server IP is blocked.')
            throw new Error('RATE_LIMITED')
        }

        // ytInitialPlayerResponse에서 자막 정보 파싱
        const match = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\});/)
        if (match) {
            try {
                const playerData = JSON.parse(match[1])
                const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks
                if (Array.isArray(tracks) && tracks.length > 0) {
                    console.log(`[YouTube] WebPage: found ${tracks.length} caption tracks`)
                    return tracks.map((t: { baseUrl: string; languageCode: string; name?: { simpleText?: string } }) => ({
                        baseUrl: t.baseUrl,
                        languageCode: t.languageCode,
                        name: t.name?.simpleText || t.languageCode,
                    }))
                }
            } catch {
                console.error('[YouTube] WebPage: JSON parse failed')
            }
        }
        console.log('[YouTube] WebPage: no caption tracks found in page source')
    } catch (err) {
        if (err instanceof Error && err.message === 'RATE_LIMITED') throw err
        console.error('[YouTube] WebPage error:', err instanceof Error ? err.message : err)
    }

    return []
}

/**
 * 자막 트랙 URL에서 텍스트 추출
 */
async function fetchTranscriptFromUrl(baseUrl: string): Promise<string> {
    const res = await fetch(baseUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
    })
    if (!res.ok) throw new Error(`Transcript fetch failed: ${res.status}`)
    const xml = await res.text()

    // XML에서 텍스트 추출 (두 가지 형식 지원)
    const texts: string[] = []

    // 형식 1: <text start="..." dur="...">내용</text>
    const textRegex = /<text[^>]*>([^<]*)<\/text>/g
    let m
    while ((m = textRegex.exec(xml)) !== null) {
        const t = decodeEntities(m[1]).trim()
        if (t) texts.push(t)
    }

    // 형식 2: <p t="..." d="..."><s>내용</s></p>
    if (texts.length === 0) {
        const pRegex = /<p\s+t="\d+"\s+d="\d+"[^>]*>([\s\S]*?)<\/p>/g
        while ((m = pRegex.exec(xml)) !== null) {
            const inner = m[1]
            const sRegex = /<s[^>]*>([^<]*)<\/s>/g
            let combined = ''
            let s
            while ((s = sRegex.exec(inner)) !== null) {
                combined += s[1]
            }
            if (!combined) combined = inner.replace(/<[^>]+>/g, '')
            const t = decodeEntities(combined).trim()
            if (t) texts.push(t)
        }
    }

    return texts.join(' ')
}

/**
 * YouTube 영상 자막 가져오기 — InnerTube API 직접 호출
 */
async function fetchTranscript(videoId: string): Promise<{ text: string; lang: string }> {
    const tracks = await getCaptionTracks(videoId)

    if (tracks.length === 0) {
        throw new Error('NO_TRANSCRIPT')
    }

    console.log(`[YouTube] Available tracks:`, tracks.map(t => `${t.languageCode}(${t.name})`).join(', '))

    // 우선순위: ko → en → 첫 번째 트랙
    const preferred = tracks.find(t => t.languageCode === 'ko')
        || tracks.find(t => t.languageCode === 'en')
        || tracks[0]

    console.log(`[YouTube] Using track: ${preferred.languageCode}`)

    const rawText = await fetchTranscriptFromUrl(preferred.baseUrl)

    const cleaned = rawText
        .replace(/\[음악\]/g, '')
        .replace(/\[Music\]/g, '')
        .replace(/\[박수\]/g, '')
        .replace(/\[Applause\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()

    if (!cleaned || cleaned.length < 10) {
        throw new Error('NO_TRANSCRIPT')
    }

    console.log(`[YouTube] Transcript OK (${preferred.languageCode}): ${cleaned.length} chars`)
    return { text: cleaned, lang: preferred.languageCode }
}

/**
 * Gemini로 자막 텍스트 정제 — 잡담/추임새/인사말 제거, 핵심 지식만 추출
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
                console.log(`[YouTube] Gemini refinement: ${rawText.length} → ${refined.length} chars`)
                return refined
            }
            return rawText
        }

        // 긴 텍스트 → 청크별 정제
        const chunks: string[] = []
        for (let i = 0; i < rawText.length; i += MAX_CHUNK) {
            chunks.push(rawText.slice(i, i + MAX_CHUNK))
        }
        console.log(`[YouTube] Long text (${rawText.length}), refining ${chunks.length} chunks`)

        const refined: string[] = []
        for (const chunk of chunks) {
            refined.push(await refineChunk(chunk))
        }
        return refined.join('\n\n')
    } catch (err) {
        console.error('[YouTube] Gemini refinement error:', err instanceof Error ? err.message : err)
        return rawText // 정제 실패 시 원본 사용
    }
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
    } catch { /* ignore */ }
    return `YouTube 영상 (${videoId})`
}

/**
 * processing_status 업데이트 + step 정보 저장
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function updateProgress(admin: any, sourceId: string, step: string) {
    await admin.from('knowledge_sources')
        .update({ processing_status: step })
        .eq('id', sourceId)
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

        const videoId = extractVideoId(url)
        if (!videoId) {
            return NextResponse.json({ error: '올바른 YouTube URL을 입력해주세요.' }, { status: 400 })
        }

        const admin = createAdmin(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )

        // 중복 확인
        const { data: existing } = await admin
            .from('knowledge_sources')
            .select('id')
            .eq('mentor_id', mentorId)
            .like('original_url', `%${videoId}%`)
            .limit(1)

        if (existing && existing.length > 0) {
            return NextResponse.json({ error: '이미 학습된 영상입니다.' }, { status: 409 })
        }

        // 영상 제목
        const title = await fetchVideoTitle(videoId)

        // knowledge_sources 레코드 삽입
        const { data: source, error: insertErr } = await admin
            .from('knowledge_sources')
            .insert({
                mentor_id: mentorId,
                title: `🎥 ${title}`,
                source_type: 'text',  // DB에 'youtube' enum 없으므로 'text' 사용
                original_url: url,
                processing_status: 'processing',
                file_size: 0,
            })
            .select('id')
            .single()

        if (insertErr || !source) {
            console.error('[YouTube] Insert error:', insertErr?.message || insertErr)
            return NextResponse.json({ error: `학습 시작에 실패했습니다: ${insertErr?.message || '알 수 없는 오류'}` }, { status: 500 })
        }

        // ═══ Step 1: 자막 추출 ═══
        let rawText: string
        try {
            const result = await fetchTranscript(videoId)
            rawText = result.text
            console.log(`[YouTube] Step1 transcript: ${rawText.length} chars, lang: ${result.lang}`)
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : ''

            let userMessage: string
            if (errMsg === 'RATE_LIMITED') {
                userMessage = '유튜브 서버 연결이 지연되고 있습니다. 잠시 후 다시 시도해주세요.'
            } else if (errMsg === 'NO_TRANSCRIPT') {
                userMessage = '이 영상에는 자막이 없어 학습할 수 없습니다. 자막이 있는 영상을 사용해주세요.'
            } else {
                userMessage = '유튜브 영상 정보를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.'
            }

            await admin.from('knowledge_sources')
                .delete()
                .eq('id', source.id)
            return NextResponse.json({ error: userMessage }, { status: 400 })
        }

        if (rawText.length < 50) {
            await admin.from('knowledge_sources')
                .delete()
                .eq('id', source.id)
            return NextResponse.json({ error: '영상 내용이 너무 짧아 학습에 적합하지 않습니다.' }, { status: 400 })
        }

        // ═══ Step 2: Gemini로 자막 정제 ═══
        const refinedText = await refineTranscriptWithGemini(rawText)
        console.log(`[YouTube] Step2 refined: ${rawText.length} → ${refinedText.length} chars`)

        // ═══ Step 3: 청크 분할 + 임베딩 ═══
        const chunks = splitIntoChunks(refinedText)
        console.log(`[YouTube] Step3 chunks: ${chunks.length}`)
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
                console.error(`[YouTube] Chunk ${i}/${chunks.length} failed:`, embErr instanceof Error ? embErr.message : embErr)
            }
        }
        console.log(`[YouTube] Embedding: ${successCount}/${chunks.length} chunks OK`)

        // ═══ 완료 ═══
        await admin.from('knowledge_sources')
            .update({
                processing_status: 'completed',
                chunk_count: successCount,
                content: refinedText,
                file_size: refinedText.length,
            })
            .eq('id', source.id)

        return NextResponse.json({
            success: true,
            title,
            chunksProcessed: successCount,
            totalChunks: chunks.length,
            totalCharacters: refinedText.length,
            originalCharacters: rawText.length,
        })
    } catch (error: unknown) {
        console.error('[YouTube API] Unhandled error:', error)
        return NextResponse.json({
            error: '유튜브 서버 연결이 지연되고 있습니다. 잠시 후 다시 시도해주세요.',
        }, { status: 500 })
    }
}
