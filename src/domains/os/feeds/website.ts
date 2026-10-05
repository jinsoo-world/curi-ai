// domains/os/feeds/website — 웹사이트를 붙이면 새 글을 자료로 가져온다.
//
// 순서 (전부 fetchPageSafely 를 지난다)
//   1. <사이트>/robots.txt 를 읽는다. 「우리 로봇은 오지 마세요」면 글을 하나도 열지 않는다
//   2. 첫 화면(또는 적은 주소)을 열어 블로그 목록을 찾는다 (1005 블로그 확장)
//        a. 주소 자체가 RSS, Atom 이면 그대로
//        b. 워드프레스면 REST (/wp-json/wp/v2/posts) 로 글 전체를 한 번에
//        c. 표준 RSS, Atom 자동 찾기 (<link rel="alternate" type="application/rss+xml">). 브런치, 대부분의 블로그가 여기
//   3. 못 찾으면 <사이트>/sitemap.xml (또는 robots.txt 가 알려준 사이트맵). 목차(사이트맵 모음)면 한 단계만 따라간다(최대 5장)
//   4. 한 번에 새 주소 20개까지(워드프레스 REST 는 한 곳 최대 글 수까지). 이미 자료로 있는 주소는 열지 않는다. 글은 기존 readUrl 로 읽는다

import { fetchPageSafely } from '@/domains/agent/fetch-url'
import { htmlToText } from '@/domains/agent/fetch-url'
import type { FetchNewItems, FeedItem, FetchOptions } from './types'
import {
    FEED_MAX_BYTES, FEED_TIMEOUT_MS, FEED_ITEM_MAX_CHARS, parseSitemap, withScheme, looksLikeFeed, parseFeed, discoverFeedLinks, fetchFeed,
    newerThan, newestFirst, pickCandidates, fillTextByReading, noteFor, cleanPostUrl, type ParsedFeedEntry,
} from './rss'
import { wpApiBaseFrom, fetchWpPosts, pickPostFeedLinks, WP_MAX_POSTS } from './blog'

/** 한 번에 새로 가져오는 주소 수 */
export const WEBSITE_MAX_PER_SYNC = 20
/** 사이트맵을 최대 몇 장까지 열어 보나 (목차 포함) */
export const MAX_SITEMAPS = 5
/** robots.txt 에서 우리를 가리키는 이름 */
const OUR_AGENT = 'curiai-bot'

/* ────────────────────────── robots.txt ────────────────────────── */

export interface RobotsRules {
    allow: string[]
    disallow: string[]
    sitemaps: string[]
}

/**
 * robots.txt 를 읽어 우리에게 해당하는 규칙만 남긴다.
 * 우리 이름(CuriAI-Bot) 칸이 있으면 그걸, 없으면 모두(*) 칸을 쓴다.
 */
export function parseRobots(txt: string): RobotsRules {
    const groups: { agents: string[]; allow: string[]; disallow: string[] }[] = []
    const sitemaps: string[] = []
    let cur: { agents: string[]; allow: string[]; disallow: string[] } | null = null
    let lastWasAgent = false
    for (const rawLine of String(txt ?? '').split(/\r?\n/)) {
        const line = rawLine.replace(/#.*$/, '').trim()
        if (!line) continue
        const i = line.indexOf(':')
        if (i < 0) continue
        const key = line.slice(0, i).trim().toLowerCase()
        const val = line.slice(i + 1).trim()
        if (key === 'sitemap') { if (/^https?:\/\//i.test(val)) sitemaps.push(val); continue }
        if (key === 'user-agent') {
            if (!cur || !lastWasAgent) { cur = { agents: [], allow: [], disallow: [] }; groups.push(cur) }
            cur.agents.push(val.toLowerCase())
            lastWasAgent = true
            continue
        }
        lastWasAgent = false
        if (!cur) continue
        if (key === 'disallow' && val) cur.disallow.push(val)
        if (key === 'allow' && val) cur.allow.push(val)
    }
    const mine = groups.find(g => g.agents.some(a => !!a && a !== '*' && OUR_AGENT.includes(a.replace(/\/.*$/, ''))))
        ?? groups.find(g => g.agents.includes('*'))
    return { allow: mine?.allow ?? [], disallow: mine?.disallow ?? [], sitemaps }
}

function ruleMatches(rule: string, path: string): boolean {
    // * = 아무 글자, 끝의 $ = 여기서 끝
    const anchored = rule.endsWith('$')
    const body = (anchored ? rule.slice(0, -1) : rule).split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
    return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path)
}

/** 이 경로를 열어도 되나. 가장 길게 맞는 규칙이 이긴다(같으면 허용) */
export function robotsAllows(rules: RobotsRules, path: string): boolean {
    let best = -1
    let allowed = true
    for (const r of rules.disallow) if (ruleMatches(r, path) && r.length > best) { best = r.length; allowed = false }
    for (const r of rules.allow) if (ruleMatches(r, path) && r.length >= best) { best = r.length; allowed = true }
    return allowed
}

/** 사이트 전체가 막혔나 (Disallow: /) */
export function robotsBlocksAll(rules: RobotsRules): boolean {
    return !robotsAllows(rules, '/') && !rules.allow.some(a => a !== '/' && a.length > 1)
}

async function loadRobots(origin: string): Promise<RobotsRules> {
    const page = await fetchPageSafely(`${origin}/robots.txt`, { maxBytes: 512 * 1024, timeoutMs: 8_000 })
    // robots.txt 가 없으면(404 등) 규칙이 없는 것 = 열어도 된다(웹의 약속)
    if (!page.ok || /<html/i.test(page.body.slice(0, 500))) return { allow: [], disallow: [], sitemaps: [] }
    return parseRobots(page.body)
}

/* ────────────────────────── 사이트맵 ────────────────────────── */

/** 사이트맵(들)에서 같은 사이트 주소만 모은다. 못 찾으면 빈 목록 */
export async function collectSitemapUrls(firstUrls: string[], host: string): Promise<{ loc: string; lastmod?: string }[]> {
    const queue = [...new Set(firstUrls)]
    const visited = new Set<string>()
    const out: { loc: string; lastmod?: string }[] = []
    let depthOneAdded = false
    while (queue.length && visited.size < MAX_SITEMAPS) {
        const url = queue.shift()!
        if (visited.has(url)) continue
        visited.add(url)
        const page = await fetchPageSafely(url, { maxBytes: FEED_MAX_BYTES, timeoutMs: FEED_TIMEOUT_MS })
        if (!page.ok) continue
        const sm = parseSitemap(page.body)
        if (sm.kind === 'index') {
            // 목차는 한 단계만 따라간다. 최근에 바뀐 것부터
            if (depthOneAdded) continue
            depthOneAdded = true
            const kids = newestFirst(sm.entries.map(e => ({ ...e, publishedAt: e.lastmod })))
            for (const k of kids) if (!visited.has(k.loc)) queue.push(k.loc)
            continue
        }
        for (const e of sm.entries) {
            try { if (new URL(e.loc).hostname.toLowerCase() === host) out.push(e) } catch { /* 넘긴다 */ }
        }
    }
    return out
}

/* ────────────────────────── 가져오기 ────────────────────────── */

function siteOf(handleOrUrl: string): URL {
    try {
        const u = new URL(withScheme(handleOrUrl))
        if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error()
        return u
    } catch {
        throw new Error('웹사이트 주소 모양이 이상해요. https:// 로 시작하는 주소를 넣어 주세요')
    }
}

/** RSS 본문(content:encoded)이 이만큼 길면 글 주소를 또 열지 않고 그대로 쓴다 (짧으면 요약뿐이라 글을 열어 전체를 읽는다) */
const FEED_FULL_MIN_CHARS = 1_200

/** 글을 못 찾았을 때 고객에게 보이는 한 줄 (짧게, 붙여넣기 안내) */
export const NO_LIST_LINE = '글 목록을 찾지 못했어요. 글 주소를 하나씩 넣거나 글을 붙여넣어 주세요'

/** RSS 로 읽을 때: 피드 글에 본문이 충분하면 그걸 쓰고, 아니면 글 주소를 연다 */
async function itemsFromFeedEntries(entries: ParsedFeedEntry[], since: Date | null, rules: RobotsRules, opts: FetchOptions) {
    const byUrl = new Map(entries.map(e => [cleanPostUrl(e.url), e]))
    const all = newestFirst(entries.map(e => ({ title: e.title, url: cleanPostUrl(e.url), publishedAt: e.publishedAt })))
    const allowed = all.filter(i => { try { return robotsAllows(rules, new URL(i.url).pathname) } catch { return false } })
    const cands = pickCandidates(newerThan(allowed, since), opts, WEBSITE_MAX_PER_SYNC)
    const inline: FeedItem[] = []
    const needReading: FeedItem[] = []
    const excerpts = new Map<string, FeedItem>()
    for (const c of cands) {
        const e = byUrl.get(c.url)
        const full = htmlToText(e?.content || '').slice(0, FEED_ITEM_MAX_CHARS)
        if (full.length >= FEED_FULL_MIN_CHARS) { inline.push({ ...c, text: full }); continue }
        needReading.push(c)
        const short = htmlToText(e?.description || e?.content || '').slice(0, FEED_ITEM_MAX_CHARS)
        if (short.replace(/\s+/g, '').length >= 30) excerpts.set(c.url, { ...c, text: short })
    }
    if (needReading.length === 0) return { items: inline, failed: [] as string[], cut: false }
    const read = await fillTextByReading(needReading, opts)
    // 전체를 못 읽은 글은 요약이라도 쓴다 (버리지 않는다)
    const fallback = read.unread.map(u => excerpts.get(u.url)).filter((x): x is FeedItem => !!x)
    return { items: [...inline, ...read.items, ...fallback], failed: read.failed, cut: read.cut }
}

/** 찾은 피드 하나에서 글을 만든다 */
async function fromEntries(entries: ParsedFeedEntry[], since: Date | null, rules: RobotsRules, opts: FetchOptions) {
    const { items, failed, cut } = await itemsFromFeedEntries(entries, since, rules, opts)
    return { items, note: noteFor(failed, cut) }
}

/**
 * 첫 화면 하나에서 블로그 글 목록을 찾는다: 피드 자체, 워드프레스 REST, 표준 RSS 자동 찾기 순서.
 * 목록 자체를 못 찾으면 null (사이트맵으로 넘어간다). 목록은 찾았는데 새 글이 없으면 items: [].
 */
async function readFromStartPage(page: { url: string; body: string }, since: Date | null, rules: RobotsRules, opts: FetchOptions) {
    // a) 주소 자체가 RSS, Atom
    if (looksLikeFeed(page.body)) return fromEntries(parseFeed(page.body), since, rules, opts)

    // b) 워드프레스 REST (글 전체가 JSON 으로 온다)
    const apiBase = wpApiBaseFrom(page.body, page.url)
    if (apiBase) {
        let restAllowed = true
        try { restAllowed = robotsAllows(rules, new URL('wp/v2/posts', apiBase).pathname) } catch { restAllowed = false }
        if (restAllowed) {
            const posts = await fetchWpPosts(apiBase, since, Math.min(opts.maxItems ?? WP_MAX_POSTS, WP_MAX_POSTS))
            if (posts && posts.length > 0) {
                const allowed = posts.filter(i => { try { return robotsAllows(rules, new URL(i.url).pathname) } catch { return false } })
                const cands = pickCandidates(newerThan(newestFirst(allowed), since), opts, WP_MAX_POSTS)
                return { items: cands }
            }
        }
    }

    // c) 표준 RSS, Atom 자동 찾기
    for (const link of pickPostFeedLinks(discoverFeedLinks(page.body, page.url)).slice(0, 2)) {
        const f = await fetchFeed(link)
        if (f && 'entries' in f && f.entries.length > 0) return fromEntries(f.entries, since, rules, opts)
    }
    return null
}

export const fetchWebsiteItems: FetchNewItems = async (feed, since, opts = {}) => {
    const site = siteOf(feed.handleOrUrl)
    const origin = site.origin
    const host = site.hostname.toLowerCase()

    const rules = await loadRobots(origin)
    if (robotsBlocksAll(rules)) {
        throw new Error('이 사이트는 robots.txt 로 자동 읽기를 막아 두었어요. 사이트 주인이 허락해야 가져올 수 있어요. 글을 하나씩 링크로 넣어 주세요')
    }

    // 1) 첫 화면(또는 적은 주소)에서 블로그 글 목록: 피드, 워드프레스 REST, 표준 RSS 찾기
    const start = site.pathname && site.pathname !== '/' ? site.toString() : `${origin}/`
    const page = await fetchPageSafely(start, { maxBytes: FEED_MAX_BYTES, timeoutMs: FEED_TIMEOUT_MS })
    if (page.ok) {
        const found = await readFromStartPage(page, since, rules, opts)
        if (found) return found
    }

    // 2) 사이트맵
    const firstSitemaps = [`${origin}/sitemap.xml`, ...rules.sitemaps.filter(s => { try { return new URL(s).hostname.toLowerCase() === host } catch { return false } })]
    const locs = await collectSitemapUrls(firstSitemaps, host)
    if (locs.length > 0) {
        const all: FeedItem[] = newestFirst(locs.map(l => ({ title: '', url: l.loc, publishedAt: l.lastmod })))
        // 첫 화면(/)은 글이 아니라 목차라서 뺀다
        const allowed = all.filter(i => { try { const p = new URL(i.url).pathname; return p !== '/' && p !== '' && robotsAllows(rules, p) } catch { return false } })
        if (allowed.length === 0) {
            throw new Error('이 사이트는 robots.txt 로 글 페이지 자동 읽기를 막아 두었어요. 글을 하나씩 링크로 넣어 주세요')
        }
        const cands = pickCandidates(newerThan(allowed, since), opts, WEBSITE_MAX_PER_SYNC)
        if (cands.length === 0) return { items: [] }
        const { items, failed, cut } = await fillTextByReading(cands, opts)
        return { items, note: noteFor(failed, cut) }
    }

    if (!page.ok) throw new Error(`웹사이트를 못 열었어요(${page.reason})`)
    throw new Error(NO_LIST_LINE)
}
