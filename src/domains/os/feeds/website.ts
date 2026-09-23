// domains/os/feeds/website — 웹사이트를 붙이면 새 글을 자료로 가져온다.
//
// 순서 (전부 fetchPageSafely 를 지난다)
//   1. <사이트>/robots.txt 를 읽는다. 「우리 로봇은 오지 마세요」면 글을 하나도 열지 않는다
//   2. <사이트>/sitemap.xml (또는 robots.txt 가 알려준 사이트맵). 목차(사이트맵 모음)면 한 단계만 따라간다(최대 5장)
//   3. 사이트맵이 없으면 첫 화면에서 RSS 링크를 찾아 그걸로 읽는다
//   4. 한 번에 새 주소 20개까지. 이미 자료로 있는 주소는 열지 않는다. 글은 기존 readUrl 로 읽는다

import { fetchPageSafely } from '@/domains/agent/fetch-url'
import type { FetchNewItems, FeedItem, FetchOptions } from './types'
import {
    FEED_MAX_BYTES, FEED_TIMEOUT_MS, parseSitemap, withScheme, looksLikeFeed, parseFeed, discoverFeedLinks, fetchFeed,
    newerThan, newestFirst, pickCandidates, fillTextByReading, noteFor, type ParsedFeedEntry,
} from './rss'

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

/** RSS 로 읽을 때: 피드 글에 본문이 충분하면 그걸 쓰고, 아니면 글 주소를 연다 */
async function itemsFromFeedEntries(entries: ParsedFeedEntry[], since: Date | null, rules: RobotsRules, opts: FetchOptions) {
    const all = newestFirst(entries.map(e => ({ title: e.title, url: e.url, publishedAt: e.publishedAt })))
    const allowed = all.filter(i => { try { return robotsAllows(rules, new URL(i.url).pathname) } catch { return false } })
    const cands = pickCandidates(newerThan(allowed, since), opts, WEBSITE_MAX_PER_SYNC)
    return fillTextByReading(cands, opts)
}

export const fetchWebsiteItems: FetchNewItems = async (feed, since, opts = {}) => {
    const site = siteOf(feed.handleOrUrl)
    const origin = site.origin
    const host = site.hostname.toLowerCase()

    const rules = await loadRobots(origin)
    if (robotsBlocksAll(rules)) {
        throw new Error('이 사이트는 robots.txt 로 자동 읽기를 막아 두었어요. 사이트 주인이 허락해야 가져올 수 있어요. 글을 하나씩 링크로 넣어 주세요')
    }

    // 1) 사이트맵
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

    // 2) 사이트맵이 없다 → 적은 주소(또는 첫 화면)에서 RSS 찾기
    const start = site.pathname && site.pathname !== '/' ? site.toString() : `${origin}/`
    const page = await fetchPageSafely(start, { maxBytes: FEED_MAX_BYTES, timeoutMs: FEED_TIMEOUT_MS })
    if (!page.ok) throw new Error(`웹사이트를 못 열었어요(${page.reason})`)
    let entries: ParsedFeedEntry[] | null = looksLikeFeed(page.body) ? parseFeed(page.body) : null
    if (!entries) {
        for (const link of discoverFeedLinks(page.body, page.url).slice(0, 2)) {
            const f = await fetchFeed(link)
            if (f && 'entries' in f) { entries = f.entries; break }
        }
    }
    if (!entries) throw new Error('이 사이트에서 글 목록(sitemap.xml 이나 RSS)을 못 찾았어요. 글을 하나씩 링크로 넣어 주세요')
    const { items, failed, cut } = await itemsFromFeedEntries(entries, since, rules, opts)
    return { items, note: noteFor(failed, cut) }
}
