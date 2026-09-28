// domains/os/readers = 링크 하나를 「글」로 읽는 단일 입구 = readUrl(url).
//
// 대표 지시 0923 「링크, 영상 읽어오는 도구를 붙이고 연동성을 높여」.
// 연동성 = 자료 넣기(domains/os/knowledge.ts addLinkSource), 자료 자동 가져오기(feeds),
// 대화 중 링크 읽기(/api/chat, 그룹방 /api/os/channels/[id]/chat)가 **같은 함수 하나**를 쓴다.
// 읽는 법이 좋아지면 모두 같이 좋아지고, 막는 규칙(SSRF)도 한 곳(fetch-url.ts)에만 있다.
//
// 흐름: 주소 검사(fetch-url.ts) → 길 고르기(router.ts) → 6갈래 (0928 「링크 읽기」, Agent Reach 의 열쇠 없는 길)
//   youtube    → youtube.ts (자막 한국어 우선, 없으면 아무 언어, 그것도 없으면 제목과 설명)
//   github     → github.ts  (공개 API, 막히면 웹페이지 읽기로)
//   naver-blog → naver.ts   (액자 안 PostView 본문, 막히면 모바일 글)
//   naver-news → naver.ts   (기사 본문 칸)
//   feed       → feed.ts    (RSS, Atom 최근 글 목록. 주소 모양이 아니어도 내용이 피드면 여기로)
//   web        → article.ts (readability 본문 추출. 글이 얇거나 첫 화면이면 RSS 링크를 찾아 목록을 더한다)
// 한도: 크기 maxBytes(대화 2MB, 자료 20MB), 시간 timeoutMs(대화 8초, 자료 45초), 글자 maxChars.

import {
    extractUrls, fetchPageSafely, isSafeFetchUrl, pickMeta,
    MAX_FETCH_BYTES, FETCH_TIMEOUT_MS, MAX_PAGE_CHARS, MAX_URLS_PER_MESSAGE,
} from '@/domains/agent/fetch-url'
import type { ReadResult, ReadFail, ReadPage } from '@/domains/agent/fetch-url'
import { extractArticle } from './article'
import { readYoutube } from './youtube'
import { classifyUrl, parseGithubUrl } from './router'
import type { LinkKind } from './router'
import { readGithub } from './github'
import { extractNaverBlog, extractNaverNews, naverBlogMobileUrl } from './naver'
import { feedToText, looksLikeFeed, discoverFeedLinks, kstStamp } from './feed'
import { cacheGet, cacheSet } from './cache'

export type { ReadResult, ReadPage, ReadFail } from '@/domains/agent/fetch-url'
export { extractArticle } from './article'
export { readYoutube, youtubeVideoId, joinCaptions, descriptionFromWatchPage, parseNextInfo, captionsToTimedText, clock } from './youtube'
export { classifyUrl, parseGithubUrl, looksLikeFeedUrl } from './router'
export type { LinkKind, GithubTarget } from './router'
export { extractNaverNews, extractNaverBlog, naverBlogMobileUrl } from './naver'
export { feedToText, kstStamp } from './feed'
export { cacheClear } from './cache'
export { buildLinkPrompt } from './prompt'
export type { LinkPrompt, ReadUrlView } from './prompt'

export interface ReadOptions {
    /** 이 크기까지만 읽는다 */
    maxBytes?: number
    /** 이 시간 안에 끝내야 한다 */
    timeoutMs?: number
    /** 글자 수 한도 (넘으면 잘라 넣는다) */
    maxChars?: number
}

/** 자료로 저장할 때 쓰는 한도 = 20MB, 45초 (서버 실행 한도 60초 안에서 저장까지 끝나야 한다) */
export const KNOWLEDGE_READ_OPTIONS: Required<ReadOptions> = { maxBytes: 20 * 1024 * 1024, timeoutMs: 45_000, maxChars: 100_000 }
/** 대화 중 바로 읽을 때 쓰는 한도 = 2MB, 8초, 1만 2천 자 (답이 늦어지면 안 된다) */
export const CHAT_READ_OPTIONS: Required<ReadOptions> = { maxBytes: MAX_FETCH_BYTES, timeoutMs: FETCH_TIMEOUT_MS, maxChars: MAX_PAGE_CHARS }

/** 이보다 짧은 본문은 「얇다」로 본다 (첫 화면, 목록 페이지). 얇으면 RSS 링크를 찾아 본다 */
const THIN_ARTICLE_CHARS = 400

/**
 * 한 번의 말에 링크가 여러 개면 링크 하나당 글자 수를 줄인다 (프롬프트가 너무 길어지지 않게).
 * 1개 = 1만 2천 자, 2개 = 8천 자씩, 3개 = 6천 자씩.
 */
export function linkBudget(count: number): number {
    if (count <= 1) return MAX_PAGE_CHARS
    return count === 2 ? 8_000 : 6_000
}

/**
 * 주소 하나를 읽어 글로 돌려준다. 절대 던지지 않는다.
 * 못 읽으면 이유를 사람 말로. 성공한 결과는 10분 동안 기억한다(서버 메모리).
 */
export async function readUrl(rawUrl: string, opts: ReadOptions = {}): Promise<ReadResult> {
    const requestedUrl = String(rawUrl ?? '').trim()
    const o = { ...CHAT_READ_OPTIONS, ...opts }
    const fail = (reason: string): ReadFail => ({ ok: false, requestedUrl, reason })

    // 🛡 어디로 가든 첫 줄은 안전 검사다 (유튜브 흉내 주소도 여기서 걸린다)
    if (!isSafeFetchUrl(requestedUrl)) return fail('열 수 없는 주소예요(공개된 http, https 주소만 읽을 수 있어요)')

    const key = `${o.maxChars}|${requestedUrl}`
    const hit = cacheGet(key)
    if (hit) return hit

    let r: ReadResult
    try {
        r = await routeRead(requestedUrl, o)
    } catch {
        r = fail('그 주소를 읽다가 문제가 생겼어요')
    }
    if (r.ok) cacheSet(key, r)
    return r
}

async function routeRead(requestedUrl: string, o: Required<ReadOptions>): Promise<ReadResult> {
    const kind = classifyUrl(requestedUrl)

    if (kind === 'youtube') {
        return readYoutube(requestedUrl, { timeoutMs: o.timeoutMs, maxChars: o.maxChars })
    }

    const started = Date.now()
    const left = () => o.timeoutMs - (Date.now() - started)

    if (kind === 'github') {
        const target = parseGithubUrl(requestedUrl)
        if (target) {
            const g = await readGithub(requestedUrl, target, { timeoutMs: Math.min(o.timeoutMs, 6_000), maxChars: o.maxChars, maxBytes: o.maxBytes })
            if (g) return g
        }
        // API 가 막혔으면(시간당 60번) github.com 웹페이지를 그냥 읽는다
        if (left() < 1_500) return { ok: false, requestedUrl, reason: 'GitHub 에서 답이 늦어 멈췄어요' }
        return readWeb(requestedUrl, { ...o, timeoutMs: left() }, 'web')
    }

    return readWeb(requestedUrl, o, kind)
}

function hostOf(url: string): string {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

function ok(requestedUrl: string, url: string, title: string, text: string, maxChars: number,
    method: ReadPage['method'], source: LinkKind): ReadPage {
    return { ok: true, url, requestedUrl, title: (title || hostOf(url) || url).slice(0, 120), text: text.slice(0, maxChars), kind: 'web', method, source }
}

/** 웹페이지 (기사, 블로그, 피드) 읽기 */
async function readWeb(requestedUrl: string, o: Required<ReadOptions>, kind: LinkKind): Promise<ReadResult> {
    const fail = (reason: string): ReadFail => ({ ok: false, requestedUrl, reason })
    const started = Date.now()
    const left = () => o.timeoutMs - (Date.now() - started)

    const page = await fetchPageSafely(requestedUrl, { maxBytes: o.maxBytes, timeoutMs: o.timeoutMs })
    if (!page.ok) {
        // 네이버 블로그 PostView 가 막히면 모바일 글로 한 번 더
        const mobile = kind === 'naver-blog' ? naverBlogMobileUrl(requestedUrl) : null
        if (mobile && left() > 1_500) {
            const m = await fetchPageSafely(mobile, { maxBytes: o.maxBytes, timeoutMs: left(), normalize: false })
            if (m.ok) return fromBlogOrArticle(requestedUrl, m.url, m.body, o.maxChars) ?? fail('그 블로그 글에서 본문을 못 찾았어요(비공개 글일 수 있어요)')
        }
        return page
    }

    // 1) 피드 (주소 모양과 상관없이 내용이 RSS, Atom 이면)
    if (looksLikeFeed(page.body)) {
        const f = feedToText(page.body, page.url)
        if (f) return ok(requestedUrl, page.url, f.title, f.text, o.maxChars, 'feed', 'feed')
        return fail('RSS 피드인데 글이 하나도 없었어요')
    }

    const host = hostOf(page.url)

    // 2) 네이버 뉴스
    if (host === 'n.news.naver.com' || host === 'news.naver.com' || host === 'm.news.naver.com') {
        const a = extractNaverNews(page.body)
        if (a) return ok(requestedUrl, page.url, a.title, a.text, o.maxChars, 'naver', 'naver-news')
    }

    // 3) 네이버 블로그 (PostView 에 본문이 없으면 모바일 글로 한 번 더)
    if (host === 'blog.naver.com' || host === 'm.blog.naver.com') {
        const a = extractNaverBlog(page.body)
        if (a) return ok(requestedUrl, page.url, a.title, a.text, o.maxChars, 'naver', 'naver-blog')
        const mobile = naverBlogMobileUrl(page.url)
        if (mobile && mobile !== page.url && left() > 1_500) {
            const m = await fetchPageSafely(mobile, { maxBytes: o.maxBytes, timeoutMs: left(), normalize: false })
            if (m.ok) {
                const r = fromBlogOrArticle(requestedUrl, m.url, m.body, o.maxChars)
                if (r) return r
            }
        }
    }

    // 4) 일반 웹페이지, 신문 기사
    const article = extractArticle(page.body, page.url)
    const header = articleHeader(page.body, article?.title ?? '', page.url)

    // 5) 글이 얇거나 사이트 첫 화면이면 RSS 링크를 찾아 최근 글 목록을 더한다
    let isHome = false
    try { isHome = new URL(page.url).pathname.replace(/\/+$/, '') === '' } catch { /* 모양이 이상하면 아님 */ }
    if ((!article || article.text.length < THIN_ARTICLE_CHARS || isHome) && left() > 1_500) {
        const feedLink = discoverFeedLinks(page.body, page.url)[0]
        if (feedLink) {
            const fp = await fetchPageSafely(feedLink, { maxBytes: o.maxBytes, timeoutMs: left() })
            const f = fp.ok && looksLikeFeed(fp.body) ? feedToText(fp.body, fp.url) : null
            if (f) {
                const first = article ? `\n\n[첫 화면 글]\n${article.text.slice(0, 2_000)}` : ''
                return ok(requestedUrl, page.url, article?.title || f.title, `${f.text}${first}`, o.maxChars, 'feed', 'feed')
            }
        }
    }

    if (!article) return fail('그 주소에서 읽을 글을 못 찾았어요(로그인이 필요하거나 화면이 프로그램으로만 그려지는 쪽일 수 있어요)')
    return ok(requestedUrl, page.url, article.title, header ? `${header}\n\n${article.text}` : article.text, o.maxChars, article.method, kind === 'naver-news' ? 'naver-news' : kind === 'naver-blog' ? 'naver-blog' : 'web')
}

function fromBlogOrArticle(requestedUrl: string, url: string, html: string, maxChars: number): ReadPage | null {
    const b = extractNaverBlog(html)
    if (b) return ok(requestedUrl, url, b.title, b.text, maxChars, 'naver', 'naver-blog')
    const a = extractArticle(html, url)
    return a ? ok(requestedUrl, url, a.title.replace(/\s*:\s*네이버 블로그\s*$/, ''), a.text, maxChars, a.method, 'naver-blog') : null
}

/** 기사 머리 (언론사, 날짜). 둘 다 없으면 빈 글 = 본문만 넣는다 */
function articleHeader(html: string, title: string, url: string): string {
    const site = pickMeta(html, 'og:site_name')
    const published = pickMeta(html, 'article:published_time') || pickMeta(html, 'og:regDate') || pickMeta(html, 'datePublished')
    const when = published ? (kstStamp(published) || published.slice(0, 20)) : ''
    const author = pickMeta(html, 'author') || pickMeta(html, 'article:author') || pickMeta(html, 'dable:author')
    const byline = /^https?:\/\//i.test(author) ? '' : author.slice(0, 60)
    if (!site && !when) return ''
    return [
        `[웹 글] ${title || hostOf(url)}`,
        site ? `출처: ${site}` : '',
        when ? `날짜: ${when}` : '',
        byline ? `글쓴이: ${byline}` : '',
        `주소: ${url}`,
    ].filter(Boolean).join('\n')
}

/** 사람 말 속 주소를 골라(최대 max개) 한꺼번에 읽는다. 대화용 한도, 링크 수에 맞춘 글자 수를 쓴다 */
export async function readUrlsInText(text: string, max = MAX_URLS_PER_MESSAGE): Promise<ReadResult[]> {
    const urls = extractUrls(text, max)
    if (urls.length === 0) return []
    const maxChars = linkBudget(urls.length)
    return Promise.all(urls.map(u => readUrl(u, { ...CHAT_READ_OPTIONS, maxChars })))
}

/**
 * 이번 말에서 읽을 주소가 든 글을 고른다.
 * 이번 말에 주소가 있으면 그 말. 없으면 바로 앞 사용자 말(최대 2개)에서 찾는다 = 「그 영상에서 ○○은?」 같은 이어 묻기.
 * 앞 말에서 찾은 것(fromHistory)은 카드를 다시 띄우지 않고, 못 읽어도 사과하지 않는다(buildLinkPrompt 가 가른다).
 * @param userTexts 사용자 말만, 오래된 것부터 (마지막이 이번 말)
 */
export function linkTextForTurn(userTexts: string[]): { text: string; fromHistory: boolean } {
    const list = (userTexts ?? []).map(t => String(t ?? ''))
    const now = list[list.length - 1] ?? ''
    if (extractUrls(now).length > 0) return { text: now, fromHistory: false }
    for (const prev of list.slice(0, -1).slice(-2).reverse()) {
        if (extractUrls(prev).length > 0) return { text: prev, fromHistory: true }
    }
    return { text: '', fromHistory: false }
}
