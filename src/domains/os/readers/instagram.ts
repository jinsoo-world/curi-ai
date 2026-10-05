/**
 * 인스타그램 공개 계정, 게시물 글 읽기 (로그인 없이). 대표 지시 0929, 1005 보강.
 * 링크 미리보기 수집기 이름으로 퍼가기 화면(/{계정}/embed/, /p/{코드}/embed/captioned/)을 받으면 공개 글이 들어 있다.
 * 퍼가기 화면이 막히면 게시물 화면의 og:description(글 전체)으로 한 번 더 읽는다.
 * 비공개 계정, 없는 계정은 둘 다 같은 빈 화면이라 「비공개이거나 주소가 달라요」로 말한다.
 */
import { PREVIEW_UA, SEARCHBOT_UA, extractCaptionJson, getPage, metaContent, searchbotFallbackOn, snsFail, decodeEntities, type SnsFail } from './social-fetch'
import { extractHashtags, extractMentions, imageExpiry, type SocialPost, type SocialProfile, type SocialMediaType } from './social-post'

const SITE = '인스타그램'

export type InstagramPost = SocialPost

/** 글만 있는 옛 모양(글 읽기만 되던 경로)을 같은 구조로 */
function plainPost(text: string): InstagramPost {
    return { platform: 'instagram', text, hashtags: extractHashtags(text), mentions: extractMentions(text), imageUrls: [] }
}

/** 공개 화면은 최근 글 6개까지만 보여 준다 (실측 1005). 코드 상한이 아니라 인스타그램 쪽 한계다 */
export const INSTAGRAM_PUBLIC_MAX = 6

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
        out.push(plainPost(t))
    }
    return out
}

/** 퍼가기 화면 안 contextJSON (따옴표가 두 번 감싸인 JSON) 을 연다. 못 열면 null */
function readContextJson(html: string): { context?: Record<string, unknown>; gql_data?: Record<string, unknown> } | null {
    const m = html.match(/contextJSON":("(?:[^"\\]|\\.)*")/)
    if (!m) return null
    try { return JSON.parse(JSON.parse(m[1]) as string) as { context?: Record<string, unknown>; gql_data?: Record<string, unknown> } } catch { return null }
}

type Rec = Record<string, unknown>
const asRec = (v: unknown): Rec | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Rec : null)
const asNum = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined)
const asStr = (v: unknown): string => (typeof v === 'string' ? v : '')

/** 게시물 하나(shortcode_media) → 구조 */
function mediaToPost(m: Rec): InstagramPost | null {
    const edges = asRec(m.edge_media_to_caption)?.edges
    const node = Array.isArray(edges) ? asRec(asRec(edges[0])?.node) : null
    const text = asStr(node?.text).trim()
    const code = asStr(m.shortcode)
    const type = asStr(m.__typename)
    const mediaType: SocialMediaType = type === 'GraphSidecar' ? 'carousel' : (m.is_video === true || type === 'GraphVideo') ? 'video' : 'image'
    const images: string[] = []
    const add = (u: unknown) => { const url = asStr(u); if (url && !images.includes(url)) images.push(url) }
    add(m.display_url)
    const kids = asRec(m.edge_sidecar_to_children)?.edges
    if (Array.isArray(kids)) for (const k of kids) add(asRec(asRec(k)?.node)?.display_url)
    const product = asStr(m.product_type)
    const hidden = m.like_and_view_counts_disabled === true
    const ts = asNum(m.taken_at_timestamp)
    if (!text && images.length === 0) return null
    return {
        platform: 'instagram', code: code || undefined, url: code ? `https://www.instagram.com/p/${code}/` : undefined,
        text, hashtags: extractHashtags(text), mentions: extractMentions(text),
        postedAt: ts ? new Date(ts * 1000).toISOString() : undefined,
        likes: hidden ? undefined : asNum(asRec(m.edge_liked_by)?.count) ?? asNum(asRec(m.edge_media_preview_like)?.count),
        comments: asNum(asRec(m.edge_media_to_comment)?.count),
        views: asNum(m.video_view_count) ?? asNum(m.video_play_count),
        mediaType, isReel: mediaType === 'video' && (product === 'clips' || product === ''),
        imageUrls: images.slice(0, 10), imageExpiresAt: images[0] ? imageExpiry(images[0]) : undefined,
    }
}

/** 계정 퍼가기 화면 → 계정 정보와 최근 글 (사진, 좋아요, 댓글, 올린 시각, 영상 여부까지) */
export function extractInstagramMedia(html: string, max = INSTAGRAM_PUBLIC_MAX): { profile?: SocialProfile; posts: InstagramPost[] } {
    const ctx = readContextJson(html)
    const c = asRec(ctx?.context)
    if (!c) return { posts: [] }
    const list = Array.isArray(c.graphql_media) ? c.graphql_media : []
    const posts: InstagramPost[] = []
    for (const g of list) {
        const m = asRec(asRec(g)?.shortcode_media)
        const post = m ? mediaToPost(m) : null
        if (post && !posts.some(x => x.code && x.code === post.code)) posts.push(post)
        if (posts.length >= max) break
    }
    const username = asStr(c.username)
    const profile: SocialProfile | undefined = username
        ? { username, name: asStr(c.full_name) || undefined, followers: asNum(c.followers_count), postsCount: asNum(c.posts_count), verified: c.verified === true || c.is_verified === true }
        : undefined
    return { profile, posts }
}

/** 게시물 하나 퍼가기 화면(gql_data) → 글 (좋아요, 댓글, 조회, 릴스 여부, 사진까지) */
export function extractInstagramPostMedia(html: string): InstagramPost | null {
    const m = asRec(asRec(readContextJson(html)?.gql_data)?.shortcode_media)
    return m ? mediaToPost(m) : null
}

/** 게시물 화면 og:description 「… on October 3, 2026: "글"」 의 날짜 → ISO (서울 기준 정오로 잡는다) */
export function extractInstagramOgDate(html: string): string | undefined {
    const d = metaContent(html, 'og:description')
    const en = d.match(/\b(?:on)\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})\s*:/)
    const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    let y = 0, mo = 0, day = 0
    if (en) { mo = MONTHS.indexOf(en[1].toLowerCase()) + 1; day = Number(en[2]); y = Number(en[3]) }
    else {
        const ko = d.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/)
        if (ko) { y = Number(ko[1]); mo = Number(ko[2]); day = Number(ko[3]) }
    }
    if (!y || !mo || !day) return undefined
    return new Date(Date.UTC(y, mo - 1, day, 3, 0, 0)).toISOString()   // 서울 정오
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

export type InstagramRead = { ok: true; posts: InstagramPost[]; profile?: SocialProfile; via: string } | SnsFail

export async function readInstagram(url: string, opts: { timeoutMs?: number; max?: number } = {}): Promise<InstagramRead> {
    const t = parseInstagramUrl(url)
    if (!t) return snsFail(SITE, 'bad_url')
    const timeout = opts.timeoutMs ?? 10_000
    const max = opts.max ?? INSTAGRAM_PUBLIC_MAX
    let lastStatus: number | undefined
    let timedOut = false
    const note = (r: { ok: false; code: string; status?: number }) => { lastStatus = r.status ?? lastStatus; if (r.code === 'timeout') timedOut = true }

    if (t.post) {
        const code = encodeURIComponent(t.post)
        // 1) 게시물 퍼가기 화면
        // 퍼가기 화면과 게시물 화면을 함께 받는다 (퍼가기 = 글, 좋아요, 사진 / 게시물 화면 = 올린 날, 글 전체 보강)
        const [e, p] = await Promise.all([
            getPage(`https://www.instagram.com/p/${code}/embed/captioned/`, PREVIEW_UA, timeout),
            getPage(`https://www.instagram.com/p/${code}/`, PREVIEW_UA, timeout),
        ])
        if (!e.ok) note(e)
        if (!p.ok) note(p)
        const postedAt = p.ok ? extractInstagramOgDate(p.html) : undefined
        const ogText = p.ok ? extractInstagramOgCaption(p.html) : ''
        // 1) 게시물 퍼가기 화면
        if (e.ok) {
            const rich = extractInstagramPostMedia(e.html)
            const c = extractInstagramCaption(e.html)
            const text = (rich?.text && rich.text.length >= 10 ? rich.text : '') || (c.length >= 10 ? c : '') || ogText
            if (text.length >= 10) {
                const base = rich ?? plainPost(text)
                return { ok: true, posts: [{ ...base, code: base.code ?? t.post, url: `https://www.instagram.com/p/${code}/`, text, hashtags: extractHashtags(text), mentions: extractMentions(text), postedAt: base.postedAt ?? postedAt }], via: 'embed' }
            }
        }
        // 2) 게시물 화면 og:description
        if (p.ok && ogText.length >= 10) return { ok: true, posts: [{ ...plainPost(ogText), code: t.post, url: `https://www.instagram.com/p/${code}/`, postedAt }], via: 'og' }
        // 3) (꺼져 있음) 검색엔진 이름표
        if (searchbotFallbackOn()) {
            const s = await getPage(`https://www.instagram.com/p/${code}/`, SEARCHBOT_UA, timeout)
            if (s.ok) { const c = extractInstagramOgCaption(s.html) || extractCaptionJson(s.html, 1)[0] || ''; if (c.length >= 10) return { ok: true, posts: [plainPost(c)], via: 'searchbot' } }
        }
        if (timedOut && !e.ok && !p.ok) return snsFail(SITE, 'timeout')
        if (!e.ok && !p.ok) return snsFail(SITE, e.code === 'not_public' || p.code === 'not_public' ? 'not_public' : 'blocked', lastStatus)
        return snsFail(SITE, 'not_public', lastStatus)
    }

    // 계정: 퍼가기 화면에 최근 게시물 글이 들어 있다
    const user = encodeURIComponent(t.user!)
    const e = await getPage(`https://www.instagram.com/${user}/embed/`, PREVIEW_UA, timeout)
    if (e.ok) {
        const rich = extractInstagramMedia(e.html, max)
        if (rich.posts.length > 0) return { ok: true, posts: rich.posts, profile: rich.profile, via: 'embed' }
        const posts = extractInstagramEmbedPosts(e.html, max)
        if (posts.length > 0) return { ok: true, posts, via: 'embed' }
    } else note(e)
    if (searchbotFallbackOn()) {
        const s = await getPage(`https://www.instagram.com/${user}/`, SEARCHBOT_UA, timeout)
        if (s.ok) { const texts = extractCaptionJson(s.html, max); if (texts.length > 0) return { ok: true, posts: texts.map(plainPost), via: 'searchbot' } }
    }
    if (timedOut && !e.ok) return snsFail(SITE, 'timeout')
    if (!e.ok) return snsFail(SITE, e.code === 'not_public' ? 'not_public' : 'blocked', lastStatus)
    return snsFail(SITE, 'not_public', e.status)
}
