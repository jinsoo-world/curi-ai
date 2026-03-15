// 디버그 전용: Vercel에서 YouTube가 실제로 뭘 반환하는지 확인
import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    const videoId = req.nextUrl.searchParams.get('v') || 'yZ7mWxxVoCQ'
    const results: Record<string, unknown> = { videoId, timestamp: new Date().toISOString() }

    // Test 1: YouTube 페이지 (CONSENT 쿠키)
    try {
        const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'ko-KR,ko;q=0.9',
                'Cookie': 'CONSENT=PENDING+987; SOCS=CAESEwgDEgk1OTg1NzA0MDAaAmVuIAEaBgiA_LyaBg',
            },
        })
        const html = await res.text()
        const hasCaptionTracks = html.includes('"captionTracks"')
        const hasConsent = html.includes('consent.youtube.com') || html.includes('CONSENT')
        const hasRecaptcha = html.includes('g-recaptcha')
        const match = html.match(/"captionTracks":(\[.*?\])/)
        
        results.test1_page = {
            status: res.status,
            htmlSize: html.length,
            hasCaptionTracks,
            hasConsentPage: hasConsent,
            hasRecaptcha,
            captionTracksFound: match ? JSON.parse(match[1]).length : 0,
            htmlSnippet: html.substring(0, 500),
        }
    } catch (err) {
        results.test1_page = { error: err instanceof Error ? err.message : String(err) }
    }

    // Test 2: InnerTube WEB API
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
        results.test2_innertube = {
            status: res.status,
            playabilityStatus: data?.playabilityStatus?.status,
            playabilityReason: data?.playabilityStatus?.reason,
            hasCaptions: !!data?.captions,
            trackCount: Array.isArray(tracks) ? tracks.length : 0,
        }
    } catch (err) {
        results.test2_innertube = { error: err instanceof Error ? err.message : String(err) }
    }

    // Test 3: oEmbed (제목만)
    try {
        const res = await fetch(`https://www.youtube.com/oembed?url=https://youtube.com/watch?v=${videoId}&format=json`)
        if (res.ok) {
            const data = await res.json()
            results.test3_oembed = { status: 'ok', title: data.title }
        } else {
            results.test3_oembed = { status: res.status }
        }
    } catch (err) {
        results.test3_oembed = { error: err instanceof Error ? err.message : String(err) }
    }

    return NextResponse.json(results, { status: 200 })
}
