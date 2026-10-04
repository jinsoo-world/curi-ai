// domains/os/feeds/parse = RSS, Atom, 사이트맵 해석기 (밖에 나가지 않는 순수 함수만).
//
// rss.ts 에서 떼어 냈다. 대화 중 링크 읽기(domains/os/readers/feed.ts)도 같은 해석기를 쓰는데,
// rss.ts 는 readers 를 불러 쓰므로 readers 가 rss.ts 를 부르면 서로 물린다. 그래서 순수한 부분만 여기 둔다.

import { htmlToText } from '@/domains/agent/fetch-url'

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
    /** 소리, 영상 파일이 달린 글인가 (팟캐스트 회차). 블로그 글은 false */
    hasMedia?: boolean
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
            hasMedia: /<enclosure\b[^>]*type="(?:audio|video)\//i.test(b),
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

/** 피드 전체의 이름 (첫 <item>, <entry> 앞의 <title>). 없으면 빈 글 */
export function feedTitle(xml: string): string {
    const src = String(xml ?? '')
    const cut = src.search(/<(item|entry)[\s>]/i)
    const head = cut >= 0 ? src.slice(0, cut) : src.slice(0, 5_000)
    return htmlToText(tagText(head, 'title')).slice(0, 120)
}
