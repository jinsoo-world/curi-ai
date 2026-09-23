// domains/os/feeds/rss — RSS, Atom, 사이트맵을 읽는 가벼운 해석기 + 같이 쓰는 도우미.
//
// 새 부품(npm)을 들이지 않는다. 우리가 읽는 모양은 딱 세 가지라 글자 규칙(정규식)으로 충분하다.
//   RSS 2.0  = <item><title/><link/><description/><pubDate/></item>
//   Atom     = <entry><title/><link href/><published/></entry>  (유튜브 채널 피드가 이 모양)
//   사이트맵 = <urlset><url><loc/><lastmod/></url></urlset> 또는 <sitemapindex><sitemap><loc/></sitemap></sitemapindex>
//
// 🛡 밖으로 나가는 요청은 전부 fetchPageSafely(주소 안전 검사 + 크기, 시간 한도)를 지난다. 맨 fetch() 금지.

import { fetchPageSafely, htmlToText } from '@/domains/agent/fetch-url'
import { readUrl, KNOWLEDGE_READ_OPTIONS } from '@/domains/os/readers'
import type { FeedItem, FetchOptions } from './types'

/** 피드, 사이트맵 한 장의 크기 한도 (큰 사이트 사이트맵은 수 MB 다) */
export const FEED_MAX_BYTES = 5 * 1024 * 1024
/** 피드 한 장 기다리는 시간 */
export const FEED_TIMEOUT_MS = 10_000
/** 자료 하나에 넣는 글자 수 한도 (조각마다 뜻 번호를 만드는 시간이 들어서 링크 넣기보다 작게 잡는다) */
export const FEED_ITEM_MAX_CHARS = 30_000
/** 글 하나 읽기를 시작하려면 최소 이만큼 시간이 남아 있어야 한다 */
const MIN_READ_MS = 4_000

/* ────────────────────────── 글자 다듬기 ────────────────────────── */

const XML_ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" }

/** CDATA 벗기기 + XML 글자 되살리기 (&amp; → &) */
export function decodeXml(s: string): string {
    return String(s ?? '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)) } catch { return ' ' } })
        .replace(/&#(\d{1,7});/g, (_, n) => { try { return String.fromCodePoint(Number(n)) } catch { return ' ' } })
        .replace(/&(amp|lt|gt|quot|apos|#39);/g, m => XML_ENTITIES[m] ?? m)
        .trim()
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/** <tag ...>안쪽</tag> 의 안쪽 (첫 번째 것). 이름에 콜론(content:encoded) 도 된다 */
function tagText(block: string, name: string): string {
    const re = new RegExp(`<${escapeRe(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRe(name)}>`, 'i')
    const m = block.match(re)
    return m ? decodeXml(m[1]) : ''
}

/** 여는 태그 하나에서 속성 값 하나 */
function attr(tag: string, name: string): string {
    const m = tag.match(new RegExp(`\\s${escapeRe(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
    return m ? decodeXml(m[1] ?? m[2] ?? '') : ''
}

/** 날짜 글자 → ISO. 못 읽으면 undefined */
export function toIso(s: string): string | undefined {
    const t = String(s ?? '').trim()
    if (!t) return undefined
    const d = new Date(t)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/* ────────────────────────── RSS, Atom ────────────────────────── */

export interface ParsedFeedEntry {
    title: string
    url: string
    /** 짧은 설명(RSS description, Atom summary, 유튜브 media:description) */
    description: string
    /** 본문 전체(RSS content:encoded, Atom content). Substack 은 여기에 글 전체가 있다 */
    content: string
    publishedAt?: string
}

/** 이 글이 RSS 나 Atom 피드인가 */
export function looksLikeFeed(body: string): boolean {
    const head = String(body ?? '').slice(0, 2_000).toLowerCase()
    return head.includes('<rss') || head.includes('<feed') || head.includes('<rdf:rdf')
}

/** RSS 2.0 과 Atom 을 같이 읽는다. 모양을 모르면 빈 목록 */
export function parseFeed(xml: string): ParsedFeedEntry[] {
    const src = String(xml ?? '')
    const out: ParsedFeedEntry[] = []

    // RSS 2.0 (<item>)
    for (const m of src.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
        const b = m[1]
        let url = tagText(b, 'link')
        if (!url) {
            // <link> 가 비어 있으면 guid 가 주소인 경우가 있다
            const guid = tagText(b, 'guid')
            if (/^https?:\/\//i.test(guid)) url = guid
        }
        if (!url) {
            // 팟캐스트는 회차 주소 없이 소리 파일(enclosure)만 있는 경우가 있다. 겹침 확인용 이름표로만 쓴다
            const enc = b.match(/<enclosure\b[^>]*>/i)?.[0]
            if (enc) url = attr(enc, 'url')
        }
        out.push({
            title: htmlToText(tagText(b, 'title')),
            url: url.trim(),
            description: tagText(b, 'description') || tagText(b, 'itunes:summary'),
            content: tagText(b, 'content:encoded'),
            publishedAt: toIso(tagText(b, 'pubDate') || tagText(b, 'dc:date')),
        })
    }
    if (out.length > 0) return out.filter(e => e.url)

    // Atom (<entry>)
    for (const m of src.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)) {
        const b = m[1]
        let url = ''
        for (const lm of b.matchAll(/<link\b[^>]*>/gi)) {
            const rel = attr(lm[0], 'rel')
            if (!rel || rel === 'alternate') { url = attr(lm[0], 'href'); break }
        }
        out.push({
            title: htmlToText(tagText(b, 'title')),
            url: url.trim(),
            description: tagText(b, 'summary') || tagText(b, 'media:description'),
            content: tagText(b, 'content'),
            publishedAt: toIso(tagText(b, 'published') || tagText(b, 'updated')),
        })
    }
    return out.filter(e => e.url)
}

/** HTML 안의 <link rel="alternate" type="application/rss+xml" href="…"> 에서 피드 주소를 찾는다 */
export function discoverFeedLinks(html: string, baseUrl: string): string[] {
    const out: string[] = []
    for (const m of String(html ?? '').matchAll(/<link\b[^>]*>/gi)) {
        const tag = m[0]
        if (!/alternate/i.test(attr(tag, 'rel'))) continue
        if (!/application\/(rss|atom)\+xml/i.test(attr(tag, 'type'))) continue
        const href = attr(tag, 'href')
        if (!href) continue
        try {
            const abs = new URL(href, baseUrl).toString()
            if (!out.includes(abs)) out.push(abs)
        } catch { /* 모양이 이상한 주소는 넘긴다 */ }
    }
    return out
}

/* ────────────────────────── 사이트맵 ────────────────────────── */

export interface ParsedSitemap {
    /** index = 다른 사이트맵을 가리키는 목차, urlset = 글 주소 목록 */
    kind: 'index' | 'urlset' | 'unknown'
    entries: { loc: string; lastmod?: string }[]
}

export function parseSitemap(xml: string): ParsedSitemap {
    const src = String(xml ?? '')
    const isIndex = /<sitemapindex[\s>]/i.test(src)
    const block = isIndex ? 'sitemap' : 'url'
    const entries: ParsedSitemap['entries'] = []
    for (const m of src.matchAll(new RegExp(`<${block}(?:\\s[^>]*)?>([\\s\\S]*?)</${block}>`, 'gi'))) {
        const loc = tagText(m[1], 'loc')
        if (!/^https?:\/\//i.test(loc)) continue
        entries.push({ loc, lastmod: toIso(tagText(m[1], 'lastmod')) })
    }
    const kind = isIndex ? 'index' : /<urlset[\s>]/i.test(src) ? 'urlset' : 'unknown'
    return { kind, entries }
}

/* ────────────────────────── 같이 쓰는 도우미 ────────────────────────── */

/** 주소 모양을 조금 고쳐 준다 (앞에 https:// 가 없으면 붙인다) */
export function withScheme(raw: string): string {
    const t = String(raw ?? '').trim()
    if (!t) return ''
    return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, '')}`
}

/** 피드 주소 하나를 안전하게 가져와 해석한다. 피드가 아니면 null (던지지 않는다) */
export async function fetchFeed(url: string): Promise<{ url: string; entries: ParsedFeedEntry[] } | { error: string } | null> {
    const page = await fetchPageSafely(url, { maxBytes: FEED_MAX_BYTES, timeoutMs: FEED_TIMEOUT_MS })
    if (!page.ok) return { error: page.reason }
    if (!looksLikeFeed(page.body)) return null
    return { url: page.url, entries: parseFeed(page.body) }
}

/**
 * 주소 하나에서 피드를 찾아 읽는다.
 * 주소 자체가 피드면 그대로, 웹페이지면 그 안의 「RSS 링크」를 따라간다. 못 찾으면 던진다.
 */
export async function loadFeedFrom(url: string): Promise<{ url: string; entries: ParsedFeedEntry[] }> {
    const page = await fetchPageSafely(url, { maxBytes: FEED_MAX_BYTES, timeoutMs: FEED_TIMEOUT_MS })
    if (!page.ok) throw new Error(page.reason)
    if (looksLikeFeed(page.body)) return { url: page.url, entries: parseFeed(page.body) }
    for (const link of discoverFeedLinks(page.body, page.url).slice(0, 2)) {
        const f = await fetchFeed(link)
        if (f && 'entries' in f) return f
    }
    throw new Error('그 주소에서 새 글 목록(RSS)을 못 찾았어요. RSS 주소를 직접 넣어 주세요')
}

/** 날짜 기준 새 글만 (날짜가 없는 글은 남긴다. 겹치는 건 주소로 거른다) */
export function newerThan<T extends { publishedAt?: string }>(items: T[], since: Date | null): T[] {
    if (!since) return items
    const t = since.getTime()
    return items.filter(i => !i.publishedAt || new Date(i.publishedAt).getTime() > t)
}

/** 최신 글이 앞으로 오게 정렬 (날짜 없는 글은 뒤로) */
export function newestFirst<T extends { publishedAt?: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => (b.publishedAt ? Date.parse(b.publishedAt) : 0) - (a.publishedAt ? Date.parse(a.publishedAt) : 0))
}

/** 이미 있는 주소, 한도, 시간을 지키며 앞에서부터 고른다 (글은 아직 안 읽는다) */
export function pickCandidates<T extends { url: string }>(items: T[], opts: FetchOptions = {}, hardCap = Infinity): T[] {
    const seen = new Set<string>()
    const out: T[] = []
    const cap = Math.min(hardCap, opts.maxItems ?? Infinity)
    for (const it of items) {
        if (out.length >= cap) break
        if (!it.url || seen.has(it.url)) continue
        seen.add(it.url)
        if (opts.isKnown?.(it.url)) continue
        out.push(it)
    }
    return out
}

/** 남은 시간 (ms). 끝 시각이 없으면 자료용 기본 한도 */
export function timeLeft(opts: FetchOptions = {}): number {
    if (!opts.deadline) return KNOWLEDGE_READ_OPTIONS.timeoutMs
    return opts.deadline - Date.now()
}

/**
 * 후보 글마다 기존 읽기 함수(readUrl)로 본문을 채운다. 유튜브면 자막, 웹이면 본문 추출.
 * 못 읽은 글은 뺀다(지어내지 않는다). 시간이 모자라면 거기서 멈춘다.
 */
export async function fillTextByReading(cands: FeedItem[], opts: FetchOptions = {}): Promise<{ items: FeedItem[]; failed: string[]; cut: boolean }> {
    const items: FeedItem[] = []
    const failed: string[] = []
    for (const c of cands) {
        const left = timeLeft(opts)
        if (left < MIN_READ_MS) return { items, failed, cut: true }
        const r = await readUrl(c.url, {
            ...KNOWLEDGE_READ_OPTIONS,
            timeoutMs: Math.min(KNOWLEDGE_READ_OPTIONS.timeoutMs, left - 1_000),
            maxChars: FEED_ITEM_MAX_CHARS,
        })
        if (!r.ok) { failed.push(r.reason); continue }
        items.push({ title: (c.title || r.title).slice(0, 120), url: c.url, text: r.text, publishedAt: c.publishedAt })
    }
    return { items, failed, cut: false }
}

/** 결과 한 줄 안내 (못 읽은 것, 시간이 모자란 것) */
export function noteFor(failed: string[], cut: boolean): string | undefined {
    const parts: string[] = []
    if (failed.length) parts.push(`${failed.length}개는 못 읽었어요(${failed[0]})`)
    if (cut) parts.push('시간이 모자라 나머지는 다음에 가져와요')
    return parts.length ? parts.join('. ') : undefined
}
