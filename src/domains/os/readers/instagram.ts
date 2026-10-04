/**
 * 인스타그램 공개 계정, 게시물 글 읽기 (로그인 없이). 대표 지시 0929, 1005 보강.
 * 링크 미리보기 수집기 이름으로 퍼가기 화면(/{계정}/embed/, /p/{코드}/embed/captioned/)을 받으면 공개 글이 들어 있다.
 * 퍼가기 화면이 막히면 게시물 화면의 og:description(글 전체)으로 한 번 더 읽는다.
 * 비공개 계정, 없는 계정은 둘 다 같은 빈 화면이라 「비공개이거나 주소가 달라요」로 말한다.
 */
import { PREVIEW_UA, SEARCHBOT_UA, extractCaptionJson, getPage, metaContent, searchbotFallbackOn, snsFail, decodeEntities, type SnsFail } from './social-fetch'

const SITE = '인스타그램'

export interface InstagramPost { text: string }

/** 인스타 주소 → 계정 이름 또는 게시물 코드 */
export function parseInstagramUrl(raw: string): { user?: string; post?: string } | null {
    let u: URL
    try { u = new URL(raw) } catch { return null }
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] === 'p' || parts[0] === 'reel' || parts[0] === 'reels' || parts[0] === 'tv') return parts[1] ? { post: parts[1] } : null
    // /계정/p/코드 , /계정/reel/코드 모양
    if (parts[0] && ['p', 'reel', 'tv'].includes(parts[1] ?? '') && parts[2]) return { post: parts[2] }
    if (parts[0] && !['explore', 'accounts', 'stories', 'direct', 'about', 'developer', 'legal'].includes(parts[0])) return { user: parts[0].replace(/^@/, '') }
    return null
}

/** 퍼가기 화면 안 데이터(따옴표가 두 번 감싸인 글)에서 게시물 글 뽑기 */
export function extractInstagramEmbedPosts(html: string, max = 5): InstagramPost[] {
    const out: InstagramPost[] = []
    const seen = new Set<string>()
    const re = /\\"text\\":\\"((?:[^"\\]|\\\\[^"]|\\\\\\")*?)\\"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) && out.length < max) {
        let t: string
        try {
            const once = JSON.parse(`"${m[1]}"`) as string
            t = JSON.parse(`"${once.replace(/"/g, '\\"')}"`) as string
        } catch { continue }
        t = t.trim()
        if (t.length < 20 || /^By using Meta AI/.test(t)) continue
        const key = t.slice(0, 80)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ text: t })
    }
    return out
}

/** 게시물 하나 퍼가기 화면의 글 (class="Caption"). 맨 앞 계정 이름 줄은 뺀다 */
export function extractInstagramCaption(html: string): string {
    const m = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/)
    if (!m) return ''
    return decodeEntities(m[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
        .replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** 게시물 화면 og:description 「29K likes, 209 comments - 계정 on 날짜: "글".」 에서 글만 */
export function extractInstagramOgCaption(html: string): string {
    const d = metaContent(html, 'og:description')
    const m = d.match(/^[^:]{0,200}?\b(?:on|에)\s[^:]{0,60}?:\s*["“]([\s\S]*?)["”]\.?\s*$/)
    return (m ? m[1] : '').trim()
}

export type InstagramRead = { ok: true; posts: InstagramPost[]; via: string } | SnsFail

export async function readInstagram(url: string, opts: { timeoutMs?: number; max?: number } = {}): Promise<InstagramRead> {
    const t = parseInstagramUrl(url)
    if (!t) return snsFail(SITE, 'bad_url')
    const timeout = opts.timeoutMs ?? 10_000
    const max = opts.max ?? 5
    let lastStatus: number | undefined
    let timedOut = false
    const note = (r: { ok: false; code: string; status?: number }) => { lastStatus = r.status ?? lastStatus; if (r.code === 'timeout') timedOut = true }

    if (t.post) {
        const code = encodeURIComponent(t.post)
        // 1) 게시물 퍼가기 화면
        const e = await getPage(`https://www.instagram.com/p/${code}/embed/captioned/`, PREVIEW_UA, timeout)
        if (e.ok) {
            const c = extractInstagramCaption(e.html)
            if (c.length >= 10) return { ok: true, posts: [{ text: c }], via: 'embed' }
        } else note(e)
        // 2) 게시물 화면 og:description
        const p = await getPage(`https://www.instagram.com/p/${code}/`, PREVIEW_UA, timeout)
        if (p.ok) {
            const c = extractInstagramOgCaption(p.html)
            if (c.length >= 10) return { ok: true, posts: [{ text: c }], via: 'og' }
        } else note(p)
        // 3) (꺼져 있음) 검색엔진 이름표
        if (searchbotFallbackOn()) {
            const s = await getPage(`https://www.instagram.com/p/${code}/`, SEARCHBOT_UA, timeout)
            if (s.ok) { const c = extractInstagramOgCaption(s.html) || extractCaptionJson(s.html, 1)[0] || ''; if (c.length >= 10) return { ok: true, posts: [{ text: c }], via: 'searchbot' } }
        }
        if (timedOut && !e.ok && !p.ok) return snsFail(SITE, 'timeout')
        if (!e.ok && !p.ok) return snsFail(SITE, e.code === 'not_public' || p.code === 'not_public' ? 'not_public' : 'blocked', lastStatus)
        return snsFail(SITE, 'not_public', lastStatus)
    }

    // 계정: 퍼가기 화면에 최근 게시물 글이 들어 있다
    const user = encodeURIComponent(t.user!)
    const e = await getPage(`https://www.instagram.com/${user}/embed/`, PREVIEW_UA, timeout)
    if (e.ok) {
        const posts = extractInstagramEmbedPosts(e.html, max)
        if (posts.length > 0) return { ok: true, posts, via: 'embed' }
    } else note(e)
    if (searchbotFallbackOn()) {
        const s = await getPage(`https://www.instagram.com/${user}/`, SEARCHBOT_UA, timeout)
        if (s.ok) { const texts = extractCaptionJson(s.html, max); if (texts.length > 0) return { ok: true, posts: texts.map(text => ({ text })), via: 'searchbot' } }
    }
    if (timedOut && !e.ok) return snsFail(SITE, 'timeout')
    if (!e.ok) return snsFail(SITE, e.code === 'not_public' ? 'not_public' : 'blocked', lastStatus)
    return snsFail(SITE, 'not_public', e.status)
}
