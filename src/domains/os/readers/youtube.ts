// domains/os/readers = 유튜브 영상을 「글」로 바꾼다 = 제목 + 채널 + 설명 + (되면) Gemini 영상 정리.
//
// 대표 결정 0928 23:53 「약관 위험 제거」: 유튜브 robots.txt 가 막은 길은 쓰지 않는다.
//   - 안 쓰는 것: 자막 도구(youtube-caption-extractor, 내부 InnerTube /player), youtubei/v1/next, 영상 웹페이지 긁기.
//   - 쓰는 것: 공식 oEmbed(제목, 채널), 공식 YouTube Data API videos.list(설명, 길이, 열쇠 YOUTUBE_API_KEY 있을 때만),
//     Gemini API 에 공개 유튜브 주소를 넘기는 공식 기능(youtube-gemini.ts, 기존 한도 그대로: 1인 하루 10, 전체 300, 60분 초과는 앞부분만, 저장).
//   - 영상 주인 OAuth 자막은 2단계(지금은 안 함).
// 못 읽는 경우는 전부 사람 말로 돌려준다. 지어내지 않는다.
// 아래 자막, next 응답 해석 함수(joinCaptions, captionsToTimedText, parseNextInfo, descriptionFromWatchPage)는
// 순수 계산이라 남겨 두지만 더는 네트워크로 부르지 않는다(주인 OAuth 자막이 오면 captionsToTimedText 를 다시 쓴다).

import type { ReadPage, ReadFail } from '@/domains/agent/fetch-url'
import { getYoutubeDigest, digestWithin, keepAlive, geminiYoutubeConfig, cleanDigest } from './youtube-gemini'
import type { DigestOutcome } from './youtube-gemini'

/** 자막 한 조각 (도구가 주는 모양, start 와 dur 은 초를 글자로) */
interface Caption { text: string; start?: string | number; dur?: string | number }

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

export interface NextInfo {
    description: string
    chapters: { at: string; title: string }[]
    views: string
    date: string
}

/**
 * (옛 길, 지금은 부르지 않음) youtubei/v1/next 응답 모양에서 설명, 챕터, 조회수, 올린 날을 꺼내는 순수 해석.
 */
export function parseNextInfo(raw: string): NextInfo {
    const s = String(raw ?? '')
    const un = (v?: string) => { if (!v) return ''; try { return JSON.parse(`"${v}"`) as string } catch { return v } }
    const description = un(s.match(/"attributedDescription":\{"content":"((?:[^"\\]|\\.)*)"/)?.[1])
    const seen = new Set<string>()
    const chapters: NextInfo['chapters'] = []
    for (const m of s.matchAll(/"macroMarkersListItemRenderer":\{"title":\{"simpleText":"((?:[^"\\]|\\.)*)"\},"timeDescription":\{"simpleText":"([^"]*)"/g)) {
        const key = `${m[2]} ${m[1]}`
        if (seen.has(key)) continue
        seen.add(key)
        chapters.push({ at: m[2], title: un(m[1]) })
    }
    const views = un(s.match(/"videoViewCountRenderer":\{"viewCount":\{"simpleText":"((?:[^"\\]|\\.)*)"/)?.[1])
    const date = un(s.match(/"dateText":\{"simpleText":"((?:[^"\\]|\\.)*)"/)?.[1])
    return { description, chapters: chapters.slice(0, 60), views, date }
}

/** 초 → 「3:05」, 한 시간 넘으면 「1:02:05」 */
export function clock(sec: number): string {
    const s = Math.max(0, Math.floor(sec))
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`
}

export interface TimedCaptions {
    text: string
    /** 영상 길이(초). 모르면 0 */
    durationSec: number
    /** 글자 한도 때문에 구간마다 앞부분만 담았나 */
    compressed: boolean
}

/**
 * 자막 → 구간마다 시각을 붙인 글 (「[3:00] …」).
 * 긴 영상은 앞에서 자르면 뒷부분 이야기를 통째로 잃는다. 그래서 구간(최대 40개)으로 나누고,
 * 한도를 넘으면 **구간마다 같은 몫**만큼 앞부분을 담아 영상 전체를 고르게 덮는다.
 * 시각 정보가 없으면 예전처럼 이어 붙이기만 한다.
 */
export function captionsToTimedText(caps: Caption[], maxChars: number): TimedCaptions {
    const items = (caps ?? [])
        .map(c => ({ t: Number(c?.start), d: Number(c?.dur) || 0, text: String(c?.text ?? '').replace(/\s+/g, ' ').trim() }))
        .filter(c => c.text)
    if (items.length === 0) return { text: '', durationSec: 0, compressed: false }
    if (items.some(c => !Number.isFinite(c.t))) {
        const flat = joinCaptions(caps)
        return { text: flat.slice(0, maxChars), durationSec: 0, compressed: flat.length > maxChars }
    }
    const last = items[items.length - 1]
    const durationSec = last.t + last.d
    const blockSec = Math.max(60, Math.ceil(durationSec / 40 / 30) * 30)
    const blocks: { at: number; text: string }[] = []
    for (const c of items) {
        const at = Math.floor(c.t / blockSec) * blockSec
        const tail = blocks[blocks.length - 1]
        if (tail && tail.at === at) tail.text += ` ${c.text}`
        else blocks.push({ at, text: c.text })
    }
    const full = blocks.map(b => `[${clock(b.at)}] ${b.text}`).join('\n')
    if (full.length <= maxChars) return { text: full, durationSec, compressed: false }

    const share = Math.max(40, Math.floor(maxChars / blocks.length) - 12)
    const cut = blocks.map(b => {
        if (b.text.length <= share) return `[${clock(b.at)}] ${b.text}`
        const piece = b.text.slice(0, share)
        const sp = piece.lastIndexOf(' ')
        return `[${clock(b.at)}] ${(sp > share * 0.6 ? piece.slice(0, sp) : piece).trim()} …`
    })
    return { text: cut.join('\n').slice(0, maxChars), durationSec, compressed: true }
}

/**
 * (옛 길, 지금은 부르지 않음) 영상 웹페이지 HTML 에서 제목과 설명을 꺼내는 순수 해석.
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
    /** 자막이 막혔을 때 Gemini 정리를 쓴다. 누가 부르는지(하루 한도)와 기다려 줄 시간. 안 주면 쓰지 않는다 */
    gemini?: { userId: string | null; waitMs?: number }
}

/** 「1:02:05」, 「3:05」 → 초. 모양이 다르면 0 */
export function clockToSec(v: string): number {
    const parts = String(v ?? '').trim().split(':').map(Number)
    if (parts.length < 2 || parts.length > 3 || parts.some(n => !Number.isFinite(n))) return 0
    return parts.reduce((a, n) => a * 60 + n, 0)
}

export interface VideoMeta {
    title: string
    channel: string
    description: string
    publishedAt: string
    durationSec: number
}

/** ISO 8601 길이(PT1H2M3S) → 초. 모르면 0 */
export function isoDurationToSec(v: string): number {
    const m = String(v ?? '').match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/)
    if (!m) return 0
    const [, d, h, mi, se] = m.map(x => Number(x) || 0)
    return d * 86400 + h * 3600 + mi * 60 + se
}

/** 공식 YouTube Data API videos.list 응답 → 영상 정보. 없으면 null */
export function parseVideosList(json: string): VideoMeta | null {
    let data: { items?: { snippet?: { title?: string; channelTitle?: string; description?: string; publishedAt?: string }; contentDetails?: { duration?: string } }[] }
    try { data = JSON.parse(json) } catch { return null }
    const it = data.items?.[0]
    if (!it?.snippet) return null
    return {
        title: String(it.snippet.title ?? ''),
        channel: String(it.snippet.channelTitle ?? ''),
        description: String(it.snippet.description ?? ''),
        publishedAt: String(it.snippet.publishedAt ?? ''),
        durationSec: isoDurationToSec(String(it.contentDetails?.duration ?? '')),
    }
}

/** 공식 Data API 로 설명과 길이 (1단위). 열쇠가 없거나 실패하면 null */
async function fetchVideoMeta(videoId: string, key: string, timeoutMs: number): Promise<VideoMeta | null> {
    try {
        const res = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(key)}`,
            { signal: AbortSignal.timeout(timeoutMs) },
        )
        if (!res.ok) return null
        return parseVideosList(await res.text())
    } catch {
        return null
    }
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
    const key = process.env.YOUTUBE_API_KEY

    const [oembed, meta] = await Promise.all([
        fetchOEmbed(id, Math.min(timeoutMs, 5_000)),
        key ? fetchVideoMeta(id, key, Math.min(timeoutMs, 5_000)) : Promise.resolve(null),
    ])
    const videoTitle = (oembed.title || meta?.title || '').trim()
    const channel = (oembed.author_name || meta?.channel || '').trim()

    // 영상 내용 = Gemini 공식 기능 (부른 쪽이 gemini 옵션을 줬을 때만, 하루 한도, 저장된 정리가 있으면 돈 없이 바로)
    let digest: DigestOutcome | null = null
    if (opts.gemini) {
        const digestStarted = Date.now()
        const digestP = getYoutubeDigest({ videoId: id, userId: opts.gemini.userId, title: videoTitle, channel })
        const waitMs = opts.gemini.waitMs ?? geminiYoutubeConfig().chatWaitMs
        digest = await digestWithin(digestP, Math.max(0, waitMs - (Date.now() - digestStarted)))
        // 시간 안에 못 끝났으면 응답 뒤에도 끝까지 해서 저장한다 (다음 질문부터 영상 내용으로 답한다)
        if (!digest.ok && digest.reason === 'waiting') void keepAlive(digestP)
    }

    if (!videoTitle && !meta && !digest?.ok) {
        return fail('이 영상 정보를 받아오지 못했어요(비공개, 삭제, 연령 제한 영상이거나 잠시 문제일 수 있어요)')
    }

    const title = (channel ? `${videoTitle || '제목 없는 영상'} | ${channel}` : (videoTitle || '제목 없는 영상')).slice(0, 120)
    const description = (meta?.description ?? '').trim()
    const baseHead = [`[유튜브 영상] ${videoTitle || '제목 없는 영상'}`, channel ? `채널: ${channel}` : ''].filter(Boolean)
    const stats = [meta?.durationSec ? `길이: ${clock(meta.durationSec)}` : '', meta?.publishedAt ? `올린 날 ${meta.publishedAt.slice(0, 10)}` : ''].filter(Boolean).join(' | ')
    const head = [...baseHead, stats, `주소: ${url}`].filter(Boolean).join('\n')

    if (digest?.ok) {
        const maxMin = geminiYoutubeConfig().maxMinutes
        const clipNote = (meta?.durationSec ?? 0) > maxMin * 60 ? `\n(영상이 ${maxMin}분보다 길어 앞 ${maxMin}분까지만 정리했어요)` : ''
        const note = `\n\n[영상 정리] (AI가 영상을 보고 들은 내용을 정리했어요. 말 그대로의 자막이 아니라 정리본이고, [분:초]는 영상 속 시각입니다)${clipNote}`
        const body = cleanDigest(digest.text)
        const room = maxChars - head.length - note.length - body.length - 20
        const desc = description && room > 200 ? `\n\n[설명]\n${description.slice(0, Math.min(800, room - 20))}${description.length > Math.min(800, room - 20) ? ' …' : ''}` : ''
        const text = `${head}${note}\n${body}${desc}`.slice(0, maxChars)
        return { ok: true, url, requestedUrl, title, text, kind: 'youtube', channel, method: 'gemini', source: 'youtube' }
    }

    // 정리가 없다 → 제목과 설명만. 그 사실을 글에 적어 봇이 영상 속 말을 아는 척하지 않게 한다.
    const why = digest && !digest.ok && digest.reason === 'waiting'
        ? '(AI가 이 영상을 정리하는 중이에요. 이번 답은 제목과 설명만 보고 합니다. 잠시 뒤 다시 물으면 영상 내용으로 답할 수 있어요)'
        : digest && !digest.ok && digest.reason === 'user-limit'
        ? '(오늘 새 영상 정리 한도를 다 써서 제목과 설명만 보고 답합니다. 영상 속에서 한 말은 모릅니다)'
        : '(이 영상의 내용은 아직 정리하지 못했어요. 제목과 설명만 보고 답합니다. 영상 속에서 한 말은 모릅니다)'
    const text = `${head}\n\n[설명]\n${description || '(설명 없음)'}\n\n${why}`.slice(0, maxChars)
    return { ok: true, url, requestedUrl, title, text, kind: 'youtube', channel, method: 'meta', source: 'youtube' }
}
