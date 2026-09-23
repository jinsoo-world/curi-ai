// domains/os/readers = 링크 하나를 「글」로 읽는 단일 입구 = readUrl(url).
//
// 대표 지시 0923 「링크, 영상 읽어오는 도구를 붙이고 연동성을 높여」.
// 연동성 = 자료 넣기(domains/os/knowledge.ts addLinkSource)와 대화 중 링크 읽기(/api/chat)가
// **같은 함수 하나**를 쓴다. 읽는 법이 좋아지면 두 곳이 같이 좋아지고, 막는 규칙(SSRF)도 한 곳에만 있다.
//
// 흐름: 주소 검사(fetch-url.ts) → 유튜브면 자막(youtube.ts) / 웹이면 본문 추출(article.ts) → 글
// 한도: 크기 maxBytes(대화 2MB, 자료 20MB), 시간 timeoutMs(대화 8초, 자료 45초), 글자 maxChars.

import {
    extractUrls, fetchPageSafely, isSafeFetchUrl, isYoutubeUrl,
    MAX_FETCH_BYTES, FETCH_TIMEOUT_MS, MAX_PAGE_CHARS, MAX_URLS_PER_MESSAGE,
} from '@/domains/agent/fetch-url'
import type { ReadResult, ReadFail } from '@/domains/agent/fetch-url'
import { extractArticle } from './article'
import { readYoutube } from './youtube'

export type { ReadResult, ReadPage, ReadFail } from '@/domains/agent/fetch-url'
export { extractArticle } from './article'
export { readYoutube, youtubeVideoId, joinCaptions } from './youtube'

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
/** 대화 중 바로 읽을 때 쓰는 한도 = 2MB, 8초, 1만 자 (답이 늦어지면 안 된다) */
export const CHAT_READ_OPTIONS: Required<ReadOptions> = { maxBytes: MAX_FETCH_BYTES, timeoutMs: FETCH_TIMEOUT_MS, maxChars: MAX_PAGE_CHARS }

/**
 * 주소 하나를 읽어 글로 돌려준다. 절대 던지지 않는다.
 * 유튜브 = 자막(한국어 우선) + 제목 + 채널. 웹 = 본문 추출(readability). 못 읽으면 이유를 사람 말로.
 */
export async function readUrl(rawUrl: string, opts: ReadOptions = {}): Promise<ReadResult> {
    const requestedUrl = String(rawUrl ?? '').trim()
    const o = { ...CHAT_READ_OPTIONS, ...opts }
    const fail = (reason: string): ReadFail => ({ ok: false, requestedUrl, reason })

    // 🛡 어디로 가든 첫 줄은 안전 검사다 (유튜브 흉내 주소도 여기서 걸린다)
    if (!isSafeFetchUrl(requestedUrl)) return fail('열 수 없는 주소예요(공개된 http, https 주소만 읽을 수 있어요)')

    if (isYoutubeUrl(requestedUrl)) {
        return readYoutube(requestedUrl, { timeoutMs: o.timeoutMs, maxChars: o.maxChars })
    }

    const page = await fetchPageSafely(requestedUrl, { maxBytes: o.maxBytes, timeoutMs: o.timeoutMs })
    if (!page.ok) return page

    const article = extractArticle(page.body, page.url)
    if (!article) return fail('그 주소에서 읽을 글을 못 찾았어요(로그인이 필요하거나 화면이 프로그램으로만 그려지는 쪽일 수 있어요)')

    return {
        ok: true,
        url: page.url,
        requestedUrl,
        title: (article.title || safeHost(page.url)).slice(0, 120),
        text: article.text.slice(0, o.maxChars),
        kind: 'web',
        method: article.method,
    }
}

/** 사람 말 속 주소를 골라(최대 max개) 한꺼번에 읽는다. 대화용 한도를 쓴다 */
export async function readUrlsInText(text: string, max = MAX_URLS_PER_MESSAGE): Promise<ReadResult[]> {
    const urls = extractUrls(text, max)
    if (urls.length === 0) return []
    return Promise.all(urls.map(u => readUrl(u, CHAT_READ_OPTIONS)))
}

function safeHost(url: string): string {
    try { return new URL(url).hostname } catch { return url }
}
