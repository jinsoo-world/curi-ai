/**
 * 스레드 공개 글 읽기 (로그인 없이). 대표 결정 0929, 1005 보강.
 *  - 글 하나 주소(/@계정/post/코드): 링크 미리보기 수집기 이름으로 받으면 og:description 에 글이 있다.
 *  - 계정 주소: 같은 방법으로는 소개 한 줄만 나온다. 글 목록은 검색엔진 이름표일 때만 나와서(기본 꺼짐, social-fetch.ts 참고)
 *    기본은 「소개만 보여요, 글 주소를 넣거나 붙여넣어 주세요」로 알려 준다.
 */
import { PREVIEW_UA, SEARCHBOT_UA, extractCaptionJson, getPage, metaContent, searchbotFallbackOn, snsFail, type SnsFail } from './social-fetch'

const SITE = '스레드'

export interface ThreadsPost { text: string }

/** 스레드 주소 → 계정, 글 코드 */
export function parseThreadsUrl(raw: string): { user?: string; post?: string } | null {
    let u: URL
    try { u = new URL(raw) } catch { return null }
    if (!/(^|\.)threads\.(net|com)$/i.test(u.hostname)) return null
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts[0] === 't' && parts[1]) return { post: parts[1] }
    const user = parts[0]?.startsWith('@') ? parts[0].slice(1) : ''
    if (user && parts[1] === 'post' && parts[2]) return { user, post: parts[2] }
    if (user) return { user }
    return null
}

/** 페이지 HTML 에서 글 본문 뽑기 (시험용으로 따로 둠) */
export function extractThreadsPosts(html: string, max = 5): ThreadsPost[] {
    const out: ThreadsPost[] = []
    const seen = new Set<string>()
    const re = /"text":"((?:[^"\\]|\\.){20,4000})"/g
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) && out.length < max) {
        let t: string
        try { t = JSON.parse(`"${m[1]}"`) as string } catch { continue }
        t = t.trim()
        if (t.length < 20 || /^https?:\/\//.test(t)) continue
        const key = t.slice(0, 80)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ text: t })
    }
    return out
}

/** 로그인 안내 같은 기본 문구 (글이 아니다) */
const GENERIC = /Join Threads|Log in with your Instagram|Threads에 가입|Instagram으로 로그인|Instagram 계정으로 로그인/i

/** 프로필 소개 한 줄 (og:description). 로그인 안내 문구면 빈 글 */
export function extractThreadsBio(html: string): string {
    const d = metaContent(html, 'og:description')
    return GENERIC.test(d) ? '' : d
}

/** 글 하나 화면의 본문 (og:description). 로그인 안내 문구면 빈 글 */
export function extractThreadsPostText(html: string): string {
    return extractThreadsBio(html)
}

export type ThreadsRead = { ok: true; bio: string; posts: ThreadsPost[]; via: string } | (SnsFail & { bio?: string })

export async function readThreads(url: string, opts: { timeoutMs?: number; max?: number } = {}): Promise<ThreadsRead> {
    const t = parseThreadsUrl(url)
    if (!t) return snsFail(SITE, 'bad_url')
    const timeout = opts.timeoutMs ?? 10_000
    const max = opts.max ?? 5
    const page = await getPage(url.replace(/^https?:\/\/(www\.)?threads\.net/i, 'https://www.threads.com'), PREVIEW_UA, timeout)
    if (!page.ok) return snsFail(SITE, page.code, page.status)

    if (t.post) {
        const text = extractThreadsPostText(page.html)
        if (text.length >= 10) return { ok: true, bio: '', posts: [{ text }], via: 'og' }
        return snsFail(SITE, 'not_public', page.status)
    }

    // 계정: 글 목록은 여기엔 없다 (있으면 쓴다)
    const found = extractThreadsPosts(page.html, max)
    const bio = extractThreadsBio(page.html)
    if (found.length > 0) return { ok: true, bio, posts: found, via: 'page' }
    if (searchbotFallbackOn()) {
        const s = await getPage(url.replace(/^https?:\/\/(www\.)?threads\.net/i, 'https://www.threads.com'), SEARCHBOT_UA, timeout)
        if (s.ok) {
            const texts = extractCaptionJson(s.html, max)
            if (texts.length > 0) return { ok: true, bio, posts: texts.map(text => ({ text })), via: 'searchbot' }
        }
    }
    // 소개가 보이면 계정은 있고 공개다 = 글만 못 읽는 것
    if (bio) return { ...snsFail(SITE, 'profile_only', page.status), bio }
    return snsFail(SITE, 'not_public', page.status)
}
