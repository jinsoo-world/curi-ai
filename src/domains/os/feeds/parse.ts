// domains/os/feeds/parse = RSS, Atom, 사이트맵 해석기 (밖에 나가지 않는 순수 함수만).
//
// rss.ts 에서 떼어 냈다. 대화 중 링크 읽기(domains/os/readers/feed.ts)도 같은 해석기를 쓰는데,
// rss.ts 는 readers 를 불러 쓰므로 readers 가 rss.ts 를 부르면 서로 물린다. 그래서 순수한 부분만 여기 둔다.

import { htmlToText } from '@/domains/agent/fetch-url'

/* ────────────────────────── 글자 다듬기 ────────────────────────── */

const XML_ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" }

/** 피드 하나에서 읽는 글 최대 수 (보안 검토 PR #53: 큰 피드로 서버를 붙잡지 못하게) */
export const MAX_FEED_ENTRIES = 200
/** 여는 태그 속성 칸 최대 길이 (끝나지 않은 여는 태그가 잔뜩 있어도 멀리 훑지 않게) */
const MAX_TAG_ATTR = 1_000

/**
 * 해석기는 전부 「앞으로만 한 번 훑기」다 (보안 검토 PR #53).
 * 예전 정규식(<item>([\s\S]*?)</item>)은 닫는 태그가 없는 문서에서 여는 태그마다 끝까지 다시 훑어 제곱 시간이 걸렸다(200KB 1.9초, 5MB 수백 초).
 * 이제 여는 태그 → 그 뒤 닫는 태그를 찾고, 닫는 태그가 없으면 그 뒤로는 블록이 있을 수 없으니 거기서 멈춘다.
 */
function openTagRe(name: string): RegExp {
    return new RegExp(`<${escapeRe(name)}(?:\\s[^<>]{0,${MAX_TAG_ATTR}})?>`, 'gi')
}
function closeTagRe(name: string): RegExp {
    return new RegExp(`</${escapeRe(name)}\\s*>`, 'gi')
}

/** <name …>안쪽</name> 블록들의 안쪽 (앞에서부터 최대 max 개) */
function blocksOf(src: string, name: string, max = Infinity): string[] {
    const open = openTagRe(name), close = closeTagRe(name)
    const out: string[] = []
    let pos = 0
    while (out.length < max) {
        open.lastIndex = pos
        const o = open.exec(src)
        if (!o) break
        close.lastIndex = o.index + o[0].length
        const c = close.exec(src)
        if (!c) break
        out.push(src.slice(o.index + o[0].length, c.index))
        pos = c.index + c[0].length
    }
    return out
}

/** CDATA 벗기기 (앞으로만 훑기) */
function stripCdata(s: string): string {
    const OPEN = '<![CDATA[', CLOSE = ']]>'
    let i = s.indexOf(OPEN)
    if (i < 0) return s
    let out = '', pos = 0
    while (i >= 0) {
        const end = s.indexOf(CLOSE, i + OPEN.length)
        if (end < 0) break
        out += s.slice(pos, i) + s.slice(i + OPEN.length, end)
        pos = end + CLOSE.length
        i = s.indexOf(OPEN, pos)
    }
    return out + s.slice(pos)
}

/** CDATA 벗기기 + XML 글자 되살리기 (&amp; → &) */
export function decodeXml(s: string): string {
    return stripCdata(String(s ?? ''))
        .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)) } catch { return ' ' } })
        .replace(/&#(\d{1,7});/g, (_, n) => { try { return String.fromCodePoint(Number(n)) } catch { return ' ' } })
        .replace(/&(amp|lt|gt|quot|apos|#39);/g, m => XML_ENTITIES[m] ?? m)
        .trim()
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/** <tag ...>안쪽</tag> 의 안쪽 (첫 번째 것). 이름에 콜론(content:encoded) 도 된다 */
function tagText(block: string, name: string): string {
    const b = blocksOf(block, name, 1)
    return b.length ? decodeXml(b[0]) : ''
}

/** 여는 태그들 (<link …>, <enclosure …>). 속성 칸은 MAX_TAG_ATTR 까지만 */
function openTags(src: string, name: string, max = Infinity): string[] {
    const re = new RegExp(`<${escapeRe(name)}\\b[^<>]{0,${MAX_TAG_ATTR}}>`, 'gi')
    const out: string[] = []
    let m: RegExpExecArray | null
    while (out.length < max && (m = re.exec(src))) out.push(m[0])
    return out
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
    for (const b of blocksOf(src, 'item', MAX_FEED_ENTRIES)) {
        let url = tagText(b, 'link')
        if (!url) {
            // <link> 가 비어 있으면 guid 가 주소인 경우가 있다
            const guid = tagText(b, 'guid')
            if (/^https?:\/\//i.test(guid)) url = guid
        }
        if (!url) {
            // 팟캐스트는 회차 주소 없이 소리 파일(enclosure)만 있는 경우가 있다. 겹침 확인용 이름표로만 쓴다
            const enc = openTags(b, 'enclosure', 1)[0]
            if (enc) url = attr(enc, 'url')
        }
        out.push({
            title: htmlToText(tagText(b, 'title')),
            url: url.trim(),
            description: tagText(b, 'description') || tagText(b, 'itunes:summary'),
            content: tagText(b, 'content:encoded'),
            publishedAt: toIso(tagText(b, 'pubDate') || tagText(b, 'dc:date')),
            hasMedia: openTags(b, 'enclosure').some(t => /^(audio|video)\//i.test(attr(t, 'type'))),
        })
    }
    if (out.length > 0) return out.filter(e => e.url)

    // Atom (<entry>)
    for (const b of blocksOf(src, 'entry', MAX_FEED_ENTRIES)) {
        let url = ''
        for (const tag of openTags(b, 'link')) {
            const rel = attr(tag, 'rel')
            if (!rel || rel === 'alternate') { url = attr(tag, 'href'); break }
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
    for (const tag of openTags(String(html ?? ''), 'link')) {
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
    for (const b of blocksOf(src, block)) {
        const loc = tagText(b, 'loc')
        if (!/^https?:\/\//i.test(loc)) continue
        entries.push({ loc, lastmod: toIso(tagText(b, 'lastmod')) })
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
