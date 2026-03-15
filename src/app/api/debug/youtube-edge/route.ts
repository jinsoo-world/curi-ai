// Edge Runtime에서 YouTube가 다르게 응답하는지 테스트
// Edge는 Cloudflare 기반이라 Serverless Function과 IP 풀이 다름
export const runtime = 'edge'

export async function GET(request: Request) {
    const url = new URL(request.url)
    const videoId = url.searchParams.get('v') || 'yZ7mWxxVoCQ'
    const results: Record<string, unknown> = { videoId, runtime: 'edge' }

    // YouTube 페이지 (CONSENT 쿠키)
    try {
        const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'ko-KR,ko;q=0.9',
                'Cookie': 'CONSENT=PENDING+987; SOCS=CAESEwgDEgk1OTg1NzA0MDAaAmVuIAEaBgiA_LyaBg',
            },
        })
        const html = await res.text()
        const hasCaptionTracks = html.includes('"captionTracks"')
        const hasConsent = html.includes('consent.youtube.com')
        const match = html.match(/"captionTracks":(\[.*?\])/)

        let trackInfo: string[] = []
        if (match) {
            try {
                const tracks = JSON.parse(match[1])
                trackInfo = tracks.map((t: { languageCode: string }) => t.languageCode)
            } catch { /* */ }
        }

        results.page = {
            status: res.status, htmlSize: html.length,
            hasCaptionTracks, hasConsent,
            trackLanguages: trackInfo,
        }
    } catch (err) {
        results.page = { error: err instanceof Error ? err.message : String(err) }
    }

    // InnerTube WEB
    try {
        const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                context: { client: { clientName: 'WEB', clientVersion: '2.20240101.00.00', hl: 'ko' } },
                videoId,
            }),
        })
        const data = await res.json()
        const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks
        results.innertube = {
            status: res.status,
            playability: data?.playabilityStatus?.status,
            trackCount: Array.isArray(tracks) ? tracks.length : 0,
        }
    } catch (err) {
        results.innertube = { error: err instanceof Error ? err.message : String(err) }
    }

    return new Response(JSON.stringify(results), {
        headers: { 'Content-Type': 'application/json' },
    })
}
