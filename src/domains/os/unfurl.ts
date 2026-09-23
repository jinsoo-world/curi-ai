// domains/os — 채팅 URL OG 미리보기. 클라이언트는 밖 HTML 직접 fetch 금지.
// 제품 카피: 가운뎃점(·)·긴 줄표(—) 금지.

import {
    fetchPageSafely, isSafeFetchUrl, pickMeta, pickTitle, extractUrls,
} from '@/domains/agent/fetch-url'

export const MAX_UNFURL_URLS = 3
export const UNFURL_TIMEOUT_MS = 5_000
export const UNFURL_MAX_BYTES = 512 * 1024

export interface UnfurlCard {
    url: string
    finalUrl: string
    title: string
    domain: string
    description: string
    imageUrl: string | null
    faviconUrl: string | null
    ok: boolean
}

function stripCopy(s: string): string {
    return s.replace(/[·—]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function domainOf(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

export function absolutizeUrl(maybe: string, base: string): string | null {
    const raw = String(maybe ?? '').trim()
    if (!raw) return null
    try {
        const u = new URL(raw, base)
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
        return u.toString()
    } catch {
        return null
    }
}

export function faviconGuess(pageUrl: string): string | null {
    try {
        const u = new URL(pageUrl)
        return `${u.origin}/favicon.ico`
    } catch {
        return null
    }
}

export function pickFaviconHref(html: string, pageUrl: string): string | null {
    const re = /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]*>/gi
    const tags = String(html ?? '').match(re) ?? []
    for (const tag of tags) {
        const href = tag.match(/href=["']([^"']+)["']/i)?.[1]
        const abs = absolutizeUrl(href ?? '', pageUrl)
        if (abs) return abs
    }
    return faviconGuess(pageUrl)
}

export function metaFromHtml(html: string, pageUrl: string, requestedUrl: string): UnfurlCard {
    const domain = domainOf(pageUrl || requestedUrl)
    const title = stripCopy(pickTitle(html, domain)).slice(0, 120) || domain
    const description = stripCopy(pickMeta(html, 'og:description') || pickMeta(html, 'description')).slice(0, 200)
    const imageUrl = absolutizeUrl(
        pickMeta(html, 'og:image') || pickMeta(html, 'twitter:image'),
        pageUrl,
    )
    const faviconUrl = pickFaviconHref(html, pageUrl)
    return {
        url: requestedUrl,
        finalUrl: pageUrl || requestedUrl,
        title,
        domain,
        description,
        imageUrl,
        faviconUrl,
        ok: true,
    }
}

export function skeletonCard(rawUrl: string): UnfurlCard {
    const domain = domainOf(rawUrl)
    return {
        url: rawUrl,
        finalUrl: rawUrl,
        title: domain,
        domain,
        description: '',
        imageUrl: null,
        faviconUrl: faviconGuess(rawUrl),
        ok: false,
    }
}

export async function unfurlUrl(rawUrl: string): Promise<UnfurlCard> {
    const requested = String(rawUrl ?? '').trim()
    if (!requested || !isSafeFetchUrl(requested)) return skeletonCard(requested || 'about:blank')

    const page = await fetchPageSafely(requested, {
        timeoutMs: UNFURL_TIMEOUT_MS,
        maxBytes: UNFURL_MAX_BYTES,
    })
    if (!page.ok) return skeletonCard(requested)

    return metaFromHtml(page.body, page.url, requested)
}

export async function unfurlUrlsInText(text: string, max = MAX_UNFURL_URLS): Promise<UnfurlCard[]> {
    const urls = extractUrls(text, max)
    if (urls.length === 0) return []
    return Promise.all(urls.map(unfurlUrl))
}

export { extractUrls }
