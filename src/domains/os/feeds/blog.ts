// domains/os/feeds/blog = 블로그 한 곳의 글 목록을 찾는 길 모음 (워드프레스 REST, 표준 RSS 찾기, 글 하나인지 가리기).
//
// 새 부품(npm)을 들이지 않는다. 본문 뽑기는 이미 쓰는 readability + linkedom (readers/article.ts) 이 한다.
// 🛡 밖으로 나가는 요청은 전부 fetchPageSafely(주소 안전 검사 + 크기, 시간 한도, 튕김 3번까지)를 지난다. 맨 fetch() 금지.
//
// 읽는 순서 (website.ts 가 부른다)
//   1. 워드프레스 REST (/wp-json/wp/v2/posts)  글 전체가 JSON 으로 오고 한 번에 많이 받는다
//   2. 표준 RSS, Atom 자동 찾기 (<link rel="alternate" type="application/rss+xml">)
//   3. 사이트맵 (website.ts)

import { fetchPageSafely, htmlToText, pickMeta } from '@/domains/agent/fetch-url'
import type { FeedItem } from './types'
import { FEED_MAX_BYTES, FEED_TIMEOUT_MS } from './rss'

/** 워드프레스 REST 로 한 번에 받는 글 수 상한 (한 곳 최대 글 수와 같다) */
export const WP_MAX_POSTS = 30
/** 이것보다 짧은 글은 REST 에서도 쓰지 않는다 (공백 뺀 글자) */
const WP_MIN_TEXT = 30

/* ────────────────────────── 워드프레스 REST ────────────────────────── */

/** 첫 화면 HTML 에서 워드프레스 REST 주소(…/wp-json/)를 찾는다. 워드프레스 같지 않으면 null */
export function wpApiBaseFrom(html: string, pageUrl: string): string | null {
    const src = String(html ?? '')
    let page: URL
    try { page = new URL(pageUrl) } catch { return null }
    for (const m of src.matchAll(/<link\b[^>]*>/gi)) {
        const tag = m[0]
        if (!/rel=["']https:\/\/api\.w\.org\/?["']/i.test(tag)) continue
        const href = tag.match(/href=["']([^"']+)["']/i)?.[1]
        if (!href) continue
        try {
            const abs = new URL(href.replace(/&#038;|&amp;/g, '&'), page)
            // 다른 서버(public-api.wordpress.com 등)를 가리키면 쓰지 않는다. 같은 사이트의 REST 만
            if (abs.hostname.toLowerCase() === page.hostname.toLowerCase() && /\/wp-json\/?$/.test(abs.pathname)) return `${abs.origin}${abs.pathname.replace(/\/?$/, '/')}`
        } catch { /* 모양이 이상하면 넘긴다 */ }
    }
    // 머리말에 표시가 없어도 워드프레스 흔적(wp-content)이 있으면 기본 주소를 한 번 시험한다
    if (/\/wp-content\/|\/wp-includes\//i.test(src)) return `${page.origin}/wp-json/`
    return null
}

interface WpPost {
    link?: unknown
    title?: { rendered?: unknown }
    date_gmt?: unknown
    date?: unknown
    content?: { rendered?: unknown; protected?: unknown }
    excerpt?: { rendered?: unknown; protected?: unknown }
}

/** 워드프레스 REST 글 목록 JSON → 글 목록. 비밀번호 글, 너무 짧은 글은 뺀다 */
export function parseWpPosts(json: unknown): FeedItem[] {
    if (!Array.isArray(json)) return []
    const out: FeedItem[] = []
    for (const p of json as WpPost[]) {
        if (!p || typeof p !== 'object') continue
        const url = typeof p.link === 'string' ? p.link.trim() : ''
        if (!/^https?:\/\//i.test(url)) continue
        if (p.content?.protected === true || p.excerpt?.protected === true) continue   // 비밀번호 글은 읽지 않는다
        const content = htmlToText(typeof p.content?.rendered === 'string' ? p.content.rendered : '')
        const excerpt = htmlToText(typeof p.excerpt?.rendered === 'string' ? p.excerpt.rendered : '')
        const text = content.length >= excerpt.length ? content : excerpt
        if (text.replace(/\s+/g, '').length < WP_MIN_TEXT) continue
        const when = typeof p.date_gmt === 'string' && p.date_gmt ? p.date_gmt : typeof p.date === 'string' ? p.date : ''
        const iso = when ? new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(when) ? when : `${when}Z`) : null
        out.push({
            title: htmlToText(typeof p.title?.rendered === 'string' ? p.title.rendered : '').slice(0, 120) || '제목 없는 글',
            url,
            text,
            publishedAt: iso && !Number.isNaN(iso.getTime()) ? iso.toISOString() : undefined,
        })
    }
    return out
}

/**
 * 워드프레스 REST 로 최근 글을 받는다. 막혀 있거나 워드프레스가 아니면 null (던지지 않는다).
 * since 가 있으면 그 뒤 글만.
 */
export async function fetchWpPosts(apiBase: string, since: Date | null, count: number): Promise<FeedItem[] | null> {
    let url: URL
    try { url = new URL('wp/v2/posts', apiBase) } catch { return null }
    url.searchParams.set('per_page', String(Math.max(1, Math.min(WP_MAX_POSTS, count))))
    url.searchParams.set('orderby', 'date')
    url.searchParams.set('order', 'desc')
    url.searchParams.set('_fields', 'link,title,date_gmt,content,excerpt')
    if (since) url.searchParams.set('after', since.toISOString().replace(/\.\d{3}Z$/, ''))
    const page = await fetchPageSafely(url.toString(), { maxBytes: FEED_MAX_BYTES, timeoutMs: FEED_TIMEOUT_MS, headers: { Accept: 'application/json' } })
    if (!page.ok) return null
    let json: unknown
    try { json = JSON.parse(page.body) } catch { return null }
    if (!Array.isArray(json)) return null
    return parseWpPosts(json)
}

/* ────────────────────────── 표준 RSS 찾기 ────────────────────────── */

/** 찾은 피드 주소 중 글 피드만 (댓글 피드 제외), 사이트 전체 피드를 앞에 */
export function pickPostFeedLinks(links: string[]): string[] {
    const isComments = (u: string) => /comments?(\/|$|\.|\?)|\/comments\//i.test(u)
    return links.filter(u => !isComments(u))
}

/* ────────────────────────── 글 하나인가, 목록인가 ────────────────────────── */

/**
 * 주소 모양만 보고 글 하나인지 목록인지 가린다. 모르면 null (페이지를 열어 봐야 안다).
 * 첫 화면(/)은 항상 목록. 날짜가 든 주소, .html, ?p=번호, /p/글 은 글 하나.
 */
export function postPathHint(raw: string): 'post' | 'list' | null {
    let u: URL
    try { u = new URL(raw) } catch { return null }
    const path = u.pathname.replace(/\/+$/, '')
    if (!path) return u.searchParams.get('p') || u.searchParams.get('page_id') ? 'post' : 'list'
    if (/^\/(category|categories|tag|tags|author|authors|page|archive|archives|blog|posts|articles|news|feed|rss|atom|search|topics?)(\/page\/\d+)?$/i.test(path)) return 'list'
    if (/^\/(category|tag|author|page|topic|topics|categories|tags)\//i.test(path)) return 'list'
    if (/\.(xml|rss|atom|json)$/i.test(path)) return 'list'
    if (/\/\d{4}\/\d{1,2}(\/\d{1,2})?\/(?!\d+$)[^/]+$/.test(path)) return 'post'         // /2026/10/05/제목, /blog/2026/10/제목 (/2026/10/05 는 날짜 목록)
    if (/^\/\d{4}(\/\d{1,2}){0,2}$/.test(path)) return 'list'
    if (/\.(html?|php)$/i.test(path) && !/(^|\/)index\.(html?|php)$/i.test(path)) return 'post'
    if (/^\/(p|post|posts|article|articles|blog|entry|archives|story|stories)\/[^/]+$/i.test(path)) return 'post'
    return null
}

/** 페이지 HTML 이 글 하나(기사, 블로그 글)인가: og:type 이 article 이거나 JSON-LD 가 글 종류 */
export function pageIsArticle(html: string): boolean {
    const src = String(html ?? '')
    const type = pickMeta(src, 'og:type').toLowerCase()
    if (type === 'article' || type === 'blog' || type === 'blogposting') return true
    if (type) return false
    return /"@type"\s*:\s*"(BlogPosting|NewsArticle|Article|TechArticle)"/i.test(src)
}

/**
 * 블로그 주소가 글 하나인지 목록(계정, 블로그 첫 화면)인지. 주소로 모르면 페이지를 열어 본다.
 * 못 열면 목록으로 본다(기존 동작).
 */
export async function detectBlogKind(raw: string): Promise<'post' | 'account'> {
    const hint = postPathHint(raw)
    if (hint) return hint === 'post' ? 'post' : 'account'
    const page = await fetchPageSafely(raw, { maxBytes: FEED_MAX_BYTES, timeoutMs: FEED_TIMEOUT_MS })
    if (!page.ok) return 'account'
    return pageIsArticle(page.body) ? 'post' : 'account'
}
