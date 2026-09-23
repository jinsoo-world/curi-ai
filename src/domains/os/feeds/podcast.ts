// domains/os/feeds/podcast — 팟캐스트, Substack 의 RSS 를 붙이면 새 글을 자료로 가져온다.
//
// 팟캐스트 = 회차 설명(쇼노트) 글만 쓴다. 소리를 글로 바꾸는 일은 여기서 하지 않는다(다른 작업 갈래가 맡는다).
// Substack = RSS 안의 본문(content:encoded)을 쓴다. 사이트 주소를 넣으면 뒤에 /feed 를 붙인다.
//            유료 글은 RSS 에도 앞부분만 나온다. 공개된 만큼만 가져온다.

import { htmlToText } from '@/domains/agent/fetch-url'
import type { FetchNewItems, FeedItem } from './types'
import { loadFeedFrom, withScheme, newerThan, newestFirst, pickCandidates, fillTextByReading, noteFor, FEED_ITEM_MAX_CHARS } from './rss'

/** 첫 연결 때 가져오는 최근 글 수 */
export const RSS_FIRST_SYNC_MAX = 5
/** 한 번에 새로 가져오는 글 수 */
export const RSS_MAX_PER_SYNC = 20
/** 본문이 이것보다 짧으면 Substack 은 글 주소를 직접 연다 */
const SUBSTACK_MIN_TEXT = 200

/**
 * Substack 입력 → RSS 주소.
 *   @이름, 이름            → https://이름.substack.com/feed
 *   이름.substack.com      → https://이름.substack.com/feed
 *   https://내도메인.com    → https://내도메인.com/feed
 *   …/feed 로 끝나면 그대로
 */
export function substackFeedUrl(raw: string): string {
    const t = String(raw ?? '').trim()
    if (/^@?[A-Za-z0-9-]{2,63}$/.test(t)) return `https://${t.replace(/^@/, '').toLowerCase()}.substack.com/feed`
    let u: URL
    try { u = new URL(withScheme(t)) } catch { throw new Error('Substack 주소 모양이 이상해요. 예: https://이름.substack.com') }
    if (/\/feed\/?$/.test(u.pathname)) return u.toString()
    return `${u.origin}/feed`
}

/** RSS 글 하나의 본문 글자 (본문 전체 우선, 없으면 설명) */
function entryText(title: string, content: string, description: string, withContent: boolean): string {
    const body = htmlToText(withContent ? (content || description) : (description || content))
    return (title ? `${title}\n\n${body}` : body).slice(0, FEED_ITEM_MAX_CHARS)
}

export const fetchPodcastItems: FetchNewItems = async (feed, since, opts = {}) => {
    const isSubstack = feed.kind === 'substack'
    const start = isSubstack ? substackFeedUrl(feed.handleOrUrl) : withScheme(feed.handleOrUrl)
    const { entries } = await loadFeedFrom(start)

    const all = newestFirst(entries)
    const cands = pickCandidates(newerThan(all, since), opts, since ? RSS_MAX_PER_SYNC : RSS_FIRST_SYNC_MAX)
    if (cands.length === 0) return { items: [] }

    const items: FeedItem[] = []
    const needReading: FeedItem[] = []
    for (const e of cands) {
        const text = entryText(e.title, e.content, e.description, isSubstack)
        const item: FeedItem = { title: (e.title || '제목 없는 글').slice(0, 120), url: e.url, text, publishedAt: e.publishedAt }
        // Substack 인데 RSS 본문이 너무 짧으면 글 주소를 연다. 팟캐스트는 쇼노트만 쓴다(소리 받아쓰기 없음)
        if (isSubstack && text.length < SUBSTACK_MIN_TEXT) needReading.push(item)
        else items.push(item)
    }
    if (needReading.length === 0) return { items }
    const read = await fillTextByReading(needReading, opts)
    return { items: [...items, ...read.items], note: noteFor(read.failed, read.cut) }
}
