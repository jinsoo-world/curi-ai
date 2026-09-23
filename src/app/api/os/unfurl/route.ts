// POST /api/os/unfurl — 채팅 URL OG 미리보기. SSRF 규칙은 fetch-url.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unfurlUrl, skeletonCard, MAX_UNFURL_URLS, type UnfurlCard } from '@/domains/os/unfurl'
import { isSafeFetchUrl } from '@/domains/agent/fetch-url'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const rawList = Array.isArray(body.urls) ? body.urls : []
    const urls = rawList
        .map(u => String(u ?? '').trim())
        .filter(Boolean)
        .filter((u, i, a) => a.indexOf(u) === i)
        .slice(0, MAX_UNFURL_URLS)

    if (urls.length === 0) return NextResponse.json({ cards: [] as UnfurlCard[] })

    // 비로그인은 골격만(남용·SSRF 표면 축소). 로그인은 실제 OG 조회.
    if (!user) {
        return NextResponse.json({ cards: urls.map(skeletonCard) })
    }

    const cards = await Promise.all(urls.map(async (u) => {
        if (!isSafeFetchUrl(u)) return skeletonCard(u)
        return unfurlUrl(u)
    }))
    return NextResponse.json({ cards })
}
