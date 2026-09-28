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
// 0928 대표 결정: 자막이 막히면 (부른 쪽이 gemini 옵션을 줬을 때만) Gemini 에게 영상을 한 번 보여 주고
//   한국어 구간 정리를 받는다 = youtube-gemini.ts (영상마다 한 번만 돈, 하루 한도, 실패하면 지금처럼 설명만).

import { fetchPageSafely } from '@/domains/agent/fetch-url'
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
 * 유튜브 「다음 영상」 창구(youtubei/v1/next) 응답에서 설명, 챕터, 조회수, 올린 날을 꺼낸다.
 * 0928 진단: Vercel 서버 IP 에서 자막 창구(player)는 「봇이 아님을 확인」으로 전부 막히지만 이 창구는 열린다.
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

const WEB_CLIENT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

/** 자막 창구가 막혔을 때 설명과 챕터라도. 실패하면 null (던지지 않는다) */
async function fetchNextInfo(videoId: string, timeoutMs: number): Promise<NextInfo | null> {
    try {
        const res = await fetch('https://www.youtube.com/youtubei/v1/next?prettyPrint=false', {
            method: 'POST',
            signal: AbortSignal.timeout(timeoutMs),
            headers: { 'Content-Type': 'application/json', 'User-Agent': WEB_CLIENT_UA, Origin: 'https://www.youtube.com' },
            body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20250925.01.00', hl: 'ko', gl: 'KR' } }, videoId }),
        })
        if (!res.ok) return null
        const info = parseNextInfo(await res.text())
        return info.description || info.chapters.length ? info : null
    } catch {
        return null
    }
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
    /** 자막이 막혔을 때 Gemini 정리를 쓴다. 누가 부르는지(하루 한도)와 기다려 줄 시간. 안 주면 쓰지 않는다 */
    gemini?: { userId: string | null; waitMs?: number }
}

/** 「1:02:05」, 「3:05」 → 초. 모양이 다르면 0 */
export function clockToSec(v: string): number {
    const parts = String(v ?? '').trim().split(':').map(Number)
    if (parts.length < 2 || parts.length > 3 || parts.some(n => !Number.isFinite(n))) return 0
    return parts.reduce((a, n) => a * 60 + n, 0)
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

    // 자막을 못 받았으면(Vercel 서버 IP 는 유튜브가 「봇 확인」으로 막는다) 설명, 챕터, 조회수라도 받는다.
    //   1순위 = next 창구 (서버 IP 에서도 열림, 0928 실측). 2순위 = 영상 웹페이지 (집, 사무실 IP 에서만 열림)
    const blocked = !details
    const noCaptions = joinCaptions(details?.subtitles ?? []).length < 20
    // 자막이 없으면 Gemini 정리를 먼저 출발시킨다(설명, 챕터 받기와 시간이 겹치게). 저장된 정리가 있으면 돈 없이 바로 나온다
    const digestStarted = Date.now()
    const digestP: Promise<DigestOutcome> | null = noCaptions && opts.gemini
        ? getYoutubeDigest({ videoId: id, userId: opts.gemini.userId, title: oembed.title ?? '', channel: oembed.author_name ?? '' })
        : null
    let next: NextInfo | null = null
    if (!details || (details.subtitles ?? []).length === 0) {
        const left = timeoutMs - (Date.now() - started)
        if (left > 1_000) next = await fetchNextInfo(id, Math.min(left, 5_000))
    }
    const left = timeoutMs - (Date.now() - started)
    if (!details && !next && left > 1_500) {
        const w = await fetchPageSafely(`${url}&hl=ko`, { timeoutMs: left, maxBytes: 3 * 1024 * 1024 })
        if (w.ok) {
            const d = descriptionFromWatchPage(w.body)
            if (d.title || d.description) details = { title: d.title || 'No title found', description: d.description || 'No description found', subtitles: [] }
        }
    }

    let digest: DigestOutcome | null = null
    if (digestP) {
        const waitMs = opts.gemini?.waitMs ?? geminiYoutubeConfig().chatWaitMs
        digest = await digestWithin(digestP, Math.max(0, waitMs - (Date.now() - digestStarted)))
        // 시간 안에 못 끝났으면 응답 뒤에도 끝까지 해서 저장한다 (다음 질문부터 영상 내용으로 답한다)
        if (!digest.ok && digest.reason === 'waiting') void keepAlive(digestP)
    }

    const videoTitle = (oembed.title || (details?.title && details.title !== 'No title found' ? details.title : '') || '').trim()
    const channel = (oembed.author_name || '').trim()
    if (!videoTitle && !details && !next && !digest?.ok) {
        return fail(/not playable|ERROR|LOGIN_REQUIRED|UNPLAYABLE/i.test(detailsError)
            ? '이 영상은 열 수 없어요(비공개, 삭제, 연령 제한 영상일 수 있어요)'
            : '이 영상 정보를 지금 받아오지 못했어요. 잠시 후 다시 넣어 주세요')
    }

    const title = (channel ? `${videoTitle || '제목 없는 영상'} | ${channel}` : (videoTitle || '제목 없는 영상')).slice(0, 120)
    const description = (details?.description && details.description !== 'No description found' ? details.description.trim() : '') || (next?.description ?? '').trim()
    const subs = details?.subtitles ?? []
    const flat = joinCaptions(subs)

    const baseHead = [`[유튜브 영상] ${videoTitle || '제목 없는 영상'}`, channel ? `채널: ${channel}` : ''].filter(Boolean)

    if (flat.length >= 20) {
        // 설명(챕터가 적혀 있는 경우가 많다)은 앞부분만 곁들이고, 나머지 몫은 전부 자막에
        const desc = description ? description.slice(0, maxChars >= 20_000 ? 3_000 : 800) : ''
        const probe = captionsToTimedText(subs, Number.MAX_SAFE_INTEGER)
        const head = [...baseHead, probe.durationSec ? `길이: ${clock(probe.durationSec)}` : '', `주소: ${url}`].filter(Boolean).join('\n')
        const descPart = desc ? `\n\n[설명]\n${desc}${description.length > desc.length ? ' …' : ''}` : ''
        const note = '\n\n[자막] (앞의 [분:초]는 영상 속 시각)'
        const room = Math.max(1_000, maxChars - head.length - descPart.length - note.length - 80)
        const timed = captionsToTimedText(subs, room)
        const cutNote = timed.compressed ? '\n(영상이 길어 구간마다 앞부분만 담았어요. 영상 전체를 고르게 훑은 것입니다)' : ''
        const text = `${head}${descPart}${note}${cutNote}\n${timed.text}`.slice(0, maxChars)
        return { ok: true, url, requestedUrl, title, text, kind: 'youtube', channel, method: 'captions', source: 'youtube' }
    }
    const stats = [next?.views, next?.date ? `올린 날 ${next.date}` : ''].filter(Boolean).join(' | ')
    const head = [...baseHead, stats, `주소: ${url}`].filter(Boolean).join('\n')

    // 자막 대신 Gemini 정리 (말 그대로의 자막이 아니라 정리본이라고 글에 적는다)
    if (digest?.ok) {
        const maxMin = geminiYoutubeConfig().maxMinutes
        const lastChapter = Math.max(0, ...(next?.chapters ?? []).map(c => clockToSec(c.at)))
        const clipNote = lastChapter > maxMin * 60 ? `\n(영상이 ${maxMin}분보다 길어 앞 ${maxMin}분까지만 정리했어요)` : ''
        const note = `\n\n[영상 정리] (자막을 직접 받지 못해 AI가 영상을 보고 들은 내용을 정리했어요. 말 그대로의 자막이 아니라 정리본이고, [분:초]는 영상 속 시각입니다)${clipNote}`
        const body = cleanDigest(digest.text)
        const room = maxChars - head.length - note.length - body.length - 20
        const desc = description && room > 200 ? `\n\n[설명]\n${description.slice(0, Math.min(800, room - 20))}${description.length > Math.min(800, room - 20) ? ' …' : ''}` : ''
        const text = `${head}${note}\n${body}${desc}`.slice(0, maxChars)
        return { ok: true, url, requestedUrl, title, text, kind: 'youtube', channel, method: 'gemini', source: 'youtube' }
    }

    // 자막이 없다 → 제목, 설명, 챕터만. 그 사실을 글에 적어 봇이 영상 속 말을 아는 척하지 않게 한다.
    const chapters = next?.chapters ?? []
    const chaptersInDesc = chapters.length > 0 && description.includes(chapters[Math.min(1, chapters.length - 1)].title)
    const chapterPart = chapters.length && !chaptersInDesc ? `\n\n[챕터]\n${chapters.map(c => `${c.at} ${c.title}`).join('\n')}` : ''
    const why = digest && !digest.ok && digest.reason === 'waiting'
        ? '(AI가 이 영상을 정리하는 중이에요. 이번 답은 제목, 설명, 챕터만 보고 합니다. 잠시 뒤 다시 물으면 영상 내용으로 답할 수 있어요)'
        : digest && !digest.ok && digest.reason === 'user-limit'
        ? '(오늘 새 영상 정리 한도를 다 써서 제목, 설명, 챕터만 보고 답합니다. 영상 속에서 한 말은 모릅니다)'
        : blocked
        ? '(지금은 이 영상의 자막을 가져오지 못했어요. 제목, 설명, 챕터만 보고 답합니다. 영상 속에서 한 말은 모릅니다)'
        : '(이 영상은 자막이 없어요. 제목, 설명, 챕터만 보고 답합니다. 영상 속에서 한 말은 모릅니다)'
    const text = `${head}\n\n[설명]\n${description || '(설명 없음)'}${chapterPart}\n\n${why}`.slice(0, maxChars)
    return { ok: true, url, requestedUrl, title, text, kind: 'youtube', channel, method: 'meta', source: 'youtube' }
}
