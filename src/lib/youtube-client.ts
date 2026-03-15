/**
 * 클라이언트(브라우저)에서 YouTube 자막을 직접 추출하는 유틸리티
 * CORS 프록시 경유 → Vercel 서버 IP 차단 우회
 * 
 * 흐름:
 * 1. CORS 프록시로 YouTube 페이지 HTML 가져오기
 * 2. ytInitialPlayerResponse에서 captionTracks 추출
 * 3. baseUrl로 자막 XML 가져오기
 * 4. XML 파싱하여 순수 텍스트 반환
 */

const CORS_PROXIES = [
    (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
]

/**
 * YouTube URL에서 videoId 추출
 */
export function extractVideoId(url: string): string | null {
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

/**
 * CORS 프록시를 통해 URL fetch (여러 프록시 순차 시도)
 */
async function fetchViaProxy(targetUrl: string): Promise<string> {
    for (let i = 0; i < CORS_PROXIES.length; i++) {
        const proxyUrl = CORS_PROXIES[i](targetUrl)
        try {
            const res = await fetch(proxyUrl)
            if (res.ok) {
                return await res.text()
            }
        } catch {
            continue
        }
    }
    throw new Error('PROXY_FAILED')
}

/**
 * HTML에서 ytInitialPlayerResponse JSON 추출 (중괄호 카운팅)
 */
function extractPlayerResponse(html: string): Record<string, unknown> | null {
    const markers = ['var ytInitialPlayerResponse = ', 'ytInitialPlayerResponse = ']

    for (const marker of markers) {
        const idx = html.indexOf(marker)
        if (idx === -1) continue

        const start = idx + marker.length
        let depth = 0
        for (let i = start; i < html.length && i < start + 500000; i++) {
            if (html[i] === '{') depth++
            else if (html[i] === '}') {
                depth--
                if (depth === 0) {
                    try {
                        return JSON.parse(html.slice(start, i + 1))
                    } catch {
                        break
                    }
                }
            }
        }
    }
    return null
}

/**
 * HTML 엔티티 디코딩
 */
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
 * 자막 XML에서 텍스트 추출
 */
function parseTranscriptXml(xml: string): string {
    const texts: string[] = []

    // 형식 1: <text start="..." dur="...">내용</text>
    const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g
    let m
    while ((m = textRegex.exec(xml)) !== null) {
        const t = decodeEntities(m[1].replace(/<[^>]+>/g, '')).trim()
        if (t) texts.push(t)
    }

    // 형식 2: <p t="..." d="..."><s>내용</s></p>
    if (texts.length === 0) {
        const pRegex = /<p\s[^>]*>([\s\S]*?)<\/p>/g
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

export interface TranscriptResult {
    text: string
    lang: string
    title: string
}

/**
 * 메인 함수: 브라우저에서 YouTube 자막 추출
 * @param videoId YouTube 영상 ID
 * @param onStep 진행 상태 콜백 (1=자막추출, 2=파싱, 3=완료)
 */
export async function extractYoutubeTranscript(
    videoId: string,
    onStep?: (step: number) => void,
): Promise<TranscriptResult> {
    onStep?.(1)

    // 1단계: YouTube 페이지 HTML 가져오기 (CORS 프록시 경유)
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`
    let html: string
    try {
        html = await fetchViaProxy(youtubeUrl)
    } catch {
        throw new Error('YouTube 페이지에 접근할 수 없습니다. 잠시 후 다시 시도해주세요.')
    }

    // CAPTCHA 감지
    if (html.includes('class="g-recaptcha"')) {
        throw new Error('YouTube 서버가 일시적으로 접근을 제한하고 있습니다. 잠시 후 다시 시도해주세요.')
    }

    // 2단계: captionTracks 추출
    onStep?.(2)
    const playerResponse = extractPlayerResponse(html)
    if (!playerResponse) {
        throw new Error('YouTube 영상 정보를 찾을 수 없습니다. URL을 확인해주세요.')
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const captions = (playerResponse as any)?.captions?.playerCaptionsTracklistRenderer?.captionTracks
    if (!Array.isArray(captions) || captions.length === 0) {
        throw new Error('이 영상에는 자막이 없습니다. 자막이 있는 영상을 사용해주세요.')
    }

    // 우선순위: ko → en → 첫 번째
    const track = captions.find((t: { languageCode: string }) => t.languageCode === 'ko')
        || captions.find((t: { languageCode: string }) => t.languageCode === 'en')
        || captions[0]

    // 3단계: 자막 XML 가져오기 + 파싱
    let transcriptXml: string
    try {
        transcriptXml = await fetchViaProxy(track.baseUrl)
    } catch {
        throw new Error('자막 데이터를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.')
    }

    const text = parseTranscriptXml(transcriptXml)
        .replace(/\[음악\]/g, '')
        .replace(/\[Music\]/g, '')
        .replace(/\[박수\]/g, '')
        .replace(/\[Applause\]/g, '')
        .replace(/\s+/g, ' ')
        .trim()

    if (!text || text.length < 30) {
        throw new Error('추출된 자막 내용이 너무 짧습니다.')
    }

    // 제목 추출
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const title = (playerResponse as any)?.videoDetails?.title || `YouTube 영상 (${videoId})`

    onStep?.(3)
    return { text, lang: track.languageCode, title }
}
