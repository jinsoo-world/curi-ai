// domains/os/feeds/youtube: 유튜브 채널을 붙이면 새 영상을 자료로 가져온다.
//
// 대표 결정 0928 23:53 「약관 위험 제거」: 유튜브 robots.txt 가 막은 공개 피드(/feeds/videos.xml)와 채널 페이지 긁기는 쓰지 않는다.
// 공식 YouTube Data API 만 쓴다(열쇠 YOUTUBE_API_KEY 가 있을 때만):
//   1. @핸들, /user/이름, /c/이름 → channels.list(forHandle, forUsername, 1단위)로 채널 번호(UC…)
//   2. 올린 영상 재생목록(UC → UU) playlistItems.list(1단위)로 최근 영상 15개
//   3. 새 영상마다 기존 읽기 함수(readUrl)로 제목, 설명(videos.list), 되면 Gemini 정리
// 열쇠가 없으면 목록 읽기는 조용히 건너뛴다(오류로 남기지 않음). 단일 영상 주소는 readers/youtube.ts 가 따로 읽는다.
// 첫 연결에서는 최근 5개만 가져온다(봇 하나에 자료 10개 한도라 100개를 쏟아부으면 안 된다).

import { fetchPageSafely } from '@/domains/agent/fetch-url'
import type { FetchNewItems, FeedItem } from './types'
import { newerThan, newestFirst, pickCandidates, fillTextByReading, noteFor } from './rss'

/** 첫 연결 때 가져오는 최근 영상 수 */
export const YOUTUBE_FIRST_SYNC_MAX = 5
/** 열쇠가 없을 때 연결 줄에 남기는 말 (오류 아님) */
export const YOUTUBE_NO_KEY_NOTE = '유튜브 영상 목록 읽기는 준비 중이에요. 영상 주소를 하나씩 넣으면 읽을 수 있어요'

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

/** 공식 channels.list 응답 → 채널 번호. 없으면 null */
export function parseChannelsList(json: string): string | null {
    try {
        const id = (JSON.parse(json) as { items?: { id?: string }[] }).items?.[0]?.id
        return id && /^UC[A-Za-z0-9_-]{22}$/.test(id) ? id : null
    } catch { return null }
}

async function channelIdByApi(query: string, key: string): Promise<string | null> {
    const page = await fetchPageSafely(`https://www.googleapis.com/youtube/v3/channels?part=id&${query}&key=${encodeURIComponent(key)}`, { maxBytes: 256 * 1024, timeoutMs: 10_000 })
    return page.ok ? parseChannelsList(page.body) : null
}

/** 적은 것 → 채널 번호 (공식 API). 못 찾으면 사람 말로 던진다 */
export async function findChannelId(handleOrUrl: string, key: string): Promise<string> {
    const r = resolveChannelInput(handleOrUrl)
    if (!r) throw new Error('유튜브 채널을 못 알아봤어요. @핸들이나 채널 주소를 넣어 주세요')
    if ('channelId' in r) return r.channelId
    const path = decodeURI(new URL(r.pageUrl).pathname).replace(/^\//, '')
    const name = path.replace(/^(@|c\/|user\/)/, '')
    const tries = path.startsWith('user/')
        ? [`forUsername=${encodeURIComponent(name)}`]
        : [`forHandle=${encodeURIComponent('@' + name)}`, `forUsername=${encodeURIComponent(name)}`]
    for (const q of tries) {
        const id = await channelIdByApi(q, key)
        if (id) return id
    }
    throw new Error('유튜브 채널 번호를 못 찾았어요. 채널 주소를 다시 확인해 주세요')
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

/** 채널의 최근 영상 목록 (공식 API 만) */
async function listRecentVideos(channelId: string, key: string): Promise<FeedItem[]> {
    const r = await listByDataApi(channelId, key)
    if (typeof r !== 'string') return r
    throw new Error(`유튜브 새 영상 목록을 지금 못 열었어요(${r}). 내일 다시 해 볼게요`)
}

export const fetchYoutubeItems: FetchNewItems = async (feed, since, opts = {}) => {
    const key = process.env.YOUTUBE_API_KEY
    if (!key) return { items: [], note: YOUTUBE_NO_KEY_NOTE }
    const channelId = await findChannelId(feed.handleOrUrl, key)
    const all: FeedItem[] = newestFirst(await listRecentVideos(channelId, key))
    const fresh = newerThan(all, since)
    const cands = pickCandidates(fresh, opts, since ? Infinity : YOUTUBE_FIRST_SYNC_MAX)
    if (cands.length === 0) return { items: [] }

    const { items, failed, cut } = await fillTextByReading(cands, opts)
    return { items, note: noteFor(failed, cut) }
}
