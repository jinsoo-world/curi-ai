// domains/os/feeds/youtube — 유튜브 채널을 붙이면 새 영상을 자료로 가져온다.
//
// 공식 공개 피드만 쓴다(열쇠 필요 없음):
//   1. @핸들이나 채널 주소 → 채널 페이지를 안전하게 열어 채널 번호(UC…)를 찾는다
//   2. https://www.youtube.com/feeds/videos.xml?channel_id=UC… (최근 영상 15개, Atom 모양)
//   3. 새 영상마다 기존 읽기 함수(readUrl)로 자막을 읽는다(자막 읽기를 새로 만들지 않는다)
// 첫 연결에서는 최근 5개만 가져온다(봇 하나에 자료 10개 한도라 100개를 쏟아부으면 안 된다).
//
// ⚠️ 2026-09-23 실측: 공개 피드(videos.xml)가 채널을 가리지 않고 404, 500 을 냈다(유튜브 쪽 문제).
//    그래서 한 번 더 시도하고, 그래도 안 되면 공식 YouTube Data API(열쇠 YOUTUBE_API_KEY 가 있을 때만)로 넘어간다.
//    둘 다 안 되면 사람 말로 던진다(연결 줄에 오류로 남고, 다음 날 크론이 다시 해 본다).

import { fetchPageSafely } from '@/domains/agent/fetch-url'
import type { FetchNewItems, FeedItem } from './types'
import { fetchFeed, newerThan, newestFirst, pickCandidates, fillTextByReading, noteFor } from './rss'

/** 첫 연결 때 가져오는 최근 영상 수 */
export const YOUTUBE_FIRST_SYNC_MAX = 5
/** 채널 페이지는 1MB 를 넘는다 */
const CHANNEL_PAGE_MAX_BYTES = 3 * 1024 * 1024

const CHANNEL_ID = /UC[A-Za-z0-9_-]{22}/

/**
 * 크리에이터가 적은 것 → 채널 번호 또는 열어 볼 채널 페이지 주소.
 *   UC…(24자)                         → 번호 그대로
 *   youtube.com/channel/UC…           → 번호 그대로
 *   @핸들, 핸들, youtube.com/@핸들      → https://www.youtube.com/@핸들
 *   youtube.com/c/이름, /user/이름      → 그 주소
 */
export function resolveChannelInput(raw: string): { channelId: string } | { pageUrl: string } | null {
    const t = String(raw ?? '').trim()
    if (!t) return null
    if (/^UC[A-Za-z0-9_-]{22}$/.test(t)) return { channelId: t }
    if (/^@?[A-Za-z0-9._-]{3,100}$/.test(t) && !t.includes('.')) {
        return { pageUrl: `https://www.youtube.com/@${t.replace(/^@/, '')}` }
    }
    if (/^@[^\s/]{2,100}$/.test(t)) return { pageUrl: `https://www.youtube.com/${encodeURI(t)}` }
    let u: URL
    try { u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`) } catch { return null }
    const host = u.hostname.replace(/^(www|m)\./, '').toLowerCase()
    if (host !== 'youtube.com') return null
    const ch = u.pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{22})/)
    if (ch) return { channelId: ch[1] }
    const path = u.pathname.match(/^\/(@[^/]+|c\/[^/]+|user\/[^/]+)/)
    if (path) return { pageUrl: `https://www.youtube.com/${path[1]}` }
    return null
}

/**
 * 채널 페이지 HTML 에서 채널 번호를 꺼낸다.
 * 페이지 안에는 추천 채널 번호도 섞여 있어서, 확실한 자리부터 본다:
 *   canonical 링크 → meta itemprop="channelId"/"identifier" → "externalId" → "channelId"
 */
export function extractChannelId(html: string): string | null {
    const src = String(html ?? '')
    const tries = [
        /<link[^>]+rel=["']canonical["'][^>]+href=["'][^"']*\/channel\/(UC[A-Za-z0-9_-]{22})/i,
        /<meta[^>]+itemprop=["']channelId["'][^>]+content=["'](UC[A-Za-z0-9_-]{22})["']/i,
        /<meta[^>]+itemprop=["']identifier["'][^>]+content=["'](UC[A-Za-z0-9_-]{22})["']/i,
        /"externalId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/,
        /"channelId"\s*:\s*"(UC[A-Za-z0-9_-]{22})"/,
    ]
    for (const re of tries) {
        const m = src.match(re)
        if (m && CHANNEL_ID.test(m[1])) return m[1]
    }
    return null
}

export function channelFeedUrl(channelId: string): string {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
}

/** 적은 것 → 채널 번호. 못 찾으면 사람 말로 던진다 */
export async function findChannelId(handleOrUrl: string): Promise<string> {
    const r = resolveChannelInput(handleOrUrl)
    if (!r) throw new Error('유튜브 채널을 못 알아봤어요. @핸들이나 채널 주소를 넣어 주세요')
    if ('channelId' in r) return r.channelId
    const page = await fetchPageSafely(r.pageUrl, { maxBytes: CHANNEL_PAGE_MAX_BYTES, timeoutMs: 10_000 })
    if (!page.ok) throw new Error(`유튜브 채널 페이지를 못 열었어요(${page.reason})`)
    const id = extractChannelId(page.body)
    if (!id) throw new Error('유튜브 채널 번호를 못 찾았어요. 채널 주소를 다시 확인해 주세요')
    return id
}

/** 공식 YouTube Data API 의 playlistItems 응답 → 영상 목록 (올린 영상 목록 = 채널 번호 UC 를 UU 로 바꾼 재생목록) */
export function parsePlaylistItems(json: string): FeedItem[] {
    let data: { items?: { snippet?: { title?: string }; contentDetails?: { videoId?: string; videoPublishedAt?: string } }[] }
    try { data = JSON.parse(json) } catch { return [] }
    return (data.items ?? []).flatMap(it => {
        const id = it.contentDetails?.videoId
        if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return []
        return [{ title: String(it.snippet?.title ?? '').slice(0, 120), url: `https://www.youtube.com/watch?v=${id}`, publishedAt: it.contentDetails?.videoPublishedAt }]
    })
}

async function listByDataApi(channelId: string, key: string): Promise<FeedItem[] | string> {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=15`
        + `&playlistId=UU${encodeURIComponent(channelId.slice(2))}&key=${encodeURIComponent(key)}`
    const page = await fetchPageSafely(url, { maxBytes: 1024 * 1024, timeoutMs: 10_000 })
    if (!page.ok) return page.reason
    return parsePlaylistItems(page.body)
}

/** 채널의 최근 영상 목록. 공개 피드 → (한 번 더) → 공식 API 순서 */
async function listRecentVideos(channelId: string): Promise<FeedItem[]> {
    let why = ''
    for (let attempt = 0; attempt < 2; attempt++) {
        const f = await fetchFeed(channelFeedUrl(channelId))
        if (f && 'entries' in f) return f.entries.map(e => ({ title: e.title, url: e.url, publishedAt: e.publishedAt }))
        why = f && 'error' in f ? f.error : '모양이 이상해요'
    }
    const key = process.env.YOUTUBE_API_KEY
    if (key) {
        const r = await listByDataApi(channelId, key)
        if (typeof r !== 'string') return r
        why = r
    }
    throw new Error(`유튜브 새 영상 목록을 지금 못 열었어요(${why}). 유튜브 쪽 문제일 수 있어요. 내일 다시 해 볼게요`)
}

export const fetchYoutubeItems: FetchNewItems = async (feed, since, opts = {}) => {
    const channelId = await findChannelId(feed.handleOrUrl)
    const all: FeedItem[] = newestFirst(await listRecentVideos(channelId))
    const fresh = newerThan(all, since)
    const cands = pickCandidates(fresh, opts, since ? Infinity : YOUTUBE_FIRST_SYNC_MAX)
    if (cands.length === 0) return { items: [] }

    const { items, failed, cut } = await fillTextByReading(cands, opts)
    return { items, note: noteFor(failed, cut) }
}
