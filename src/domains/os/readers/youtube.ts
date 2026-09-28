// domains/os/readers = 유튜브 영상을 「글」로 바꾼다 = 자막(한국어 우선) + 제목 + 채널.
//
// 도구 = youtube-caption-extractor (0 open issues, 2026-09 갱신, 의존성 2개, MIT).
//   유튜브 내부 API(InnerTube /player)로 자막 목록을 받아 json3 로 읽는다. 열쇠(API key) 필요 없음.
//   실측 0923: 한국어 영상 자동 자막 872조각 0.8초. youtubei.js 는 get_transcript 가 400 으로 깨져 있었다.
// 제목, 채널 = 유튜브 공식 oEmbed(열쇠 없음). 자막 도구가 죽어도 제목은 살린다.
//
// 못 읽는 경우는 전부 사람 말로 돌려준다. 지어내지 않는다.
//   - 자막이 없다 → 제목과 설명만 기억하고 「이 영상은 자막이 없어요」
//   - 비공개, 삭제, 연령 제한 → 「이 영상은 열 수 없어요」
// ⚠ 유튜브가 데이터센터 IP(Vercel)를 막을 때가 있다. 그때도 oEmbed 제목은 대개 살아 있어 제목만 저장된다.

import { fetchPageSafely } from '@/domains/agent/fetch-url'
import type { ReadPage, ReadFail } from '@/domains/agent/fetch-url'

/** 자막 한 조각 (도구가 주는 모양) */
interface Caption { text: string }

/** 유튜브 주소에서 영상 번호(11자)를 꺼낸다. 아니면 null */
export function youtubeVideoId(raw: string): string | null {
    let u: URL
    try { u = new URL(String(raw ?? '')) } catch { return null }
    const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase()
    const ok = (id: string | null | undefined) => (id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null)
    if (host === 'youtu.be') return ok(u.pathname.split('/')[1])
    if (host !== 'youtube.com' && host !== 'music.youtube.com') return null
    if (u.pathname === '/watch') return ok(u.searchParams.get('v'))
    const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/)
    return m ? m[2] : null
}

/** 자막 조각을 한 글로 이어 붙인다 (줄바꿈은 띄어쓰기로, 반복 공백 정리) */
export function joinCaptions(caps: Caption[]): string {
    return caps
        .map(c => String(c?.text ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' ')
        .trim()
}

/**
 * 시간 한도가 있는 fetch (도구가 자기 시간제한이 없어서 우리가 감싼다).
 * 도구는 안에서 여러 번 부른다(앱 종류 3가지 + 자막). 한 번마다 새로 재면 8초가 24초가 되므로
 * **전체 마감 하나**를 같이 쓴다.
 */
function fetchWithDeadline(deadline: AbortSignal): typeof fetch {
    return (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline })
}

/**
 * 도구가 통째로 실패했을 때(유튜브가 앱 창구를 막을 때) 영상 웹페이지에서 설명만이라도 건진다.
 * ytInitialPlayerResponse 안의 shortDescription. 못 찾으면 og:description.
 */
export function descriptionFromWatchPage(html: string): { title: string; description: string } {
    const src = String(html ?? '')
    const unescape = (v: string) => { try { return JSON.parse(`"${v}"`) as string } catch { return v } }
    const desc = src.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/)?.[1]
    const title = src.match(/"videoDetails":\{[^}]*?"title":"((?:[^"\\]|\\.)*)"/)?.[1]
    const og = src.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)?.[1]
    return { title: title ? unescape(title) : '', description: desc ? unescape(desc) : (og ?? '') }
}

interface OEmbed { title?: string; author_name?: string }

/** 공식 oEmbed 로 제목과 채널을 받는다. 실패하면 빈 값 */
async function fetchOEmbed(videoId: string, timeoutMs: number): Promise<OEmbed> {
    try {
        const res = await fetch(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
            { signal: AbortSignal.timeout(timeoutMs) },
        )
        if (!res.ok) return {}
        return (await res.json()) as OEmbed
    } catch {
        return {}
    }
}

export interface YoutubeOptions {
    timeoutMs?: number
    maxChars?: number
}

/**
 * 유튜브 주소 → 자료 글. 절대 던지지 않는다.
 * 제목은 「영상 제목 | 채널」 모양으로 돌려준다(자료 목록에 그대로 쓴다).
 */
export async function readYoutube(rawUrl: string, opts: YoutubeOptions = {}): Promise<ReadPage | ReadFail> {
    const requestedUrl = String(rawUrl ?? '').trim()
    const timeoutMs = opts.timeoutMs ?? 15_000
    const maxChars = opts.maxChars ?? 100_000
    const fail = (reason: string): ReadFail => ({ ok: false, requestedUrl, reason })

    const id = youtubeVideoId(requestedUrl)
    if (!id) return fail('유튜브 영상 주소가 아니에요(영상 하나의 주소를 넣어 주세요)')
    const url = `https://www.youtube.com/watch?v=${id}`

    // 자막 도구는 무거워서 필요할 때만 불러온다(대화 서버 첫 실행이 느려지지 않게)
    const [{ getVideoDetails }, oembed] = await Promise.all([
        import('youtube-caption-extractor'),
        fetchOEmbed(id, Math.min(timeoutMs, 5_000)),
    ])

    let details: { title: string; description: string; subtitles: Caption[] } | null = null
    let detailsError = ''
    const started = Date.now()
    try {
        // 한국어 자막 우선. 없으면 도구가 자동 자막, 그다음 아무 언어나 첫 자막을 고른다
        details = await getVideoDetails({ videoID: id, lang: 'ko', fetch: fetchWithDeadline(AbortSignal.timeout(timeoutMs)) })
    } catch (e) {
        detailsError = e instanceof Error ? e.message : String(e)
    }

    // 도구가 통째로 실패했으면 영상 웹페이지에서 설명이라도 (남은 시간이 있을 때만)
    const left = timeoutMs - (Date.now() - started)
    if (!details && left > 1_500) {
        const w = await fetchPageSafely(`${url}&hl=ko`, { timeoutMs: left, maxBytes: 3 * 1024 * 1024 })
        if (w.ok) {
            const d = descriptionFromWatchPage(w.body)
            if (d.title || d.description) details = { title: d.title || 'No title found', description: d.description || 'No description found', subtitles: [] }
        }
    }

    const videoTitle = (oembed.title || (details?.title && details.title !== 'No title found' ? details.title : '') || '').trim()
    const channel = (oembed.author_name || '').trim()
    if (!videoTitle && !details) {
        return fail(/not playable|ERROR|LOGIN_REQUIRED|UNPLAYABLE/i.test(detailsError)
            ? '이 영상은 열 수 없어요(비공개, 삭제, 연령 제한 영상일 수 있어요)'
            : '이 영상 정보를 지금 받아오지 못했어요. 잠시 후 다시 넣어 주세요')
    }

    const title = (channel ? `${videoTitle || '제목 없는 영상'} | ${channel}` : (videoTitle || '제목 없는 영상')).slice(0, 120)
    const description = details?.description && details.description !== 'No description found' ? details.description.trim() : ''
    const captions = joinCaptions(details?.subtitles ?? [])

    const head = [`[유튜브 영상] ${videoTitle || '제목 없는 영상'}`, channel ? `채널: ${channel}` : '', `주소: ${url}`].filter(Boolean).join('\n')

    if (captions.length >= 20) {
        const text = `${head}\n\n[자막]\n${captions}`.slice(0, maxChars)
        return { ok: true, url, requestedUrl, title, text, kind: 'youtube', channel, method: 'captions', source: 'youtube' }
    }

    // 자막이 없다 → 제목과 설명만. 그 사실을 글에 적어 봇이 아는 척하지 않게 한다.
    const text = `${head}\n\n[설명]\n${description || '(설명 없음)'}\n\n(이 영상은 자막이 없어요. 제목과 설명만 기억합니다)`.slice(0, maxChars)
    return { ok: true, url, requestedUrl, title, text, kind: 'youtube', channel, method: 'meta', source: 'youtube' }
}
