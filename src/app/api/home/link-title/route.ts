// GET /api/home/link-title?url= : /home 자료 칩에 넣을 제목 한 줄 (대표 지시 0929 01:09). 가입 전에도 쓴다.
// 돈 드는 호출 없음. 유튜브는 공개 oEmbed, 나머지는 채팅 미리보기와 같은 안전한 읽기(unfurlUrl: 사설 주소, 되돌리기 막음, 5초, 512KB).
// 제목만 돌려준다. 못 받으면 주소로 만든 이름. 못 읽는다는 말은 하지 않는다.
import { NextResponse } from 'next/server'
import { unfurlUrl } from '@/domains/os/unfurl'
import { isSafeFetchUrl } from '@/domains/agent/fetch-url'
import { cleanLinkTitle, homeLinkFallbackTitle, homeLinkPlatform } from '@/domains/home/link-chip'

export const dynamic = 'force-dynamic'
export const maxDuration = 10

// 한 서버 안에서만 세는 가벼운 막이 (1분에 30번)
const hits = new Map<string, { n: number; at: number }>()
function tooMany(ip: string): boolean {
    const now = Date.now()
    const h = hits.get(ip)
    if (!h || now - h.at > 60_000) { hits.set(ip, { n: 1, at: now }); if (hits.size > 5000) hits.clear(); return false }
    h.n += 1
    return h.n > 30
}

async function youtubeTitle(url: string): Promise<string | null> {
    try {
        const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(4000) })
        if (!r.ok) return null
        const j = await r.json() as { title?: string; author_name?: string }
        return j.title || j.author_name || null
    } catch { return null }
}

export async function GET(req: Request) {
    const raw = new URL(req.url).searchParams.get('url')?.trim() ?? ''
    const url = /^https?:\/\//i.test(raw) ? raw : raw ? `https://${raw}` : ''
    if (!url || url.length > 2000 || !isSafeFetchUrl(url)) return NextResponse.json({ title: null }, { status: 400 })
    const platform = homeLinkPlatform(url)
    const fallback = homeLinkFallbackTitle(url)
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
    if (tooMany(ip)) return NextResponse.json({ title: fallback, platform })

    let title: string | null = null
    if (platform === 'youtube') title = cleanLinkTitle(await youtubeTitle(url))
    if (!title) {
        try { const card = await unfurlUrl(url); if (card.ok) title = cleanLinkTitle(card.title) } catch { /* 이름으로 */ }
    }
    return NextResponse.json(
        { title: title ?? fallback, platform },
        { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
    )
}
