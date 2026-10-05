// domains/os/readers: 인스타그램, 스레드 공개 화면에서 읽은 글 한 편의 구조와, 봇이 배울 글로 바꾸는 규칙 (대표 지시 1005 「사진과 좋아요까지」).
// 서버, 브라우저 어디서든 쓸 수 있게 순수 함수만 둔다. 읽는 쪽은 instagram.ts, 저장은 knowledge.ts.

export type SocialPlatform = 'instagram' | 'threads'
export type SocialMediaType = 'image' | 'video' | 'carousel'

export interface SocialProfile {
    username: string
    name?: string
    followers?: number
    postsCount?: number
    verified?: boolean
}

export interface SocialPost {
    platform: SocialPlatform
    /** 게시물 코드 (주소 끝) */
    code?: string
    url?: string
    /** 캡션 전문 */
    text: string
    hashtags: string[]
    mentions: string[]
    /** 올린 시각 (ISO) */
    postedAt?: string
    /** 공개 화면에 나온 숫자. 숨겨 두었으면 없다 */
    likes?: number
    comments?: number
    views?: number
    mediaType?: SocialMediaType
    /** 릴스(짧은 영상) 인가 */
    isReel?: boolean
    /** 사진 주소 (대표 한 장 + 여러 장 글의 나머지). 인스타그램 사진 주소는 며칠 뒤 만료된다 */
    imageUrls: string[]
    imageExpiresAt?: string
}

export function extractHashtags(text: string): string[] {
    const out: string[] = []
    for (const m of text.matchAll(/#([\p{L}\p{N}_]{1,60})/gu)) {
        if (/^\d+$/.test(m[1])) continue
        const tag = m[1]
        if (!out.includes(tag)) out.push(tag)
    }
    return out
}

export function extractMentions(text: string): string[] {
    const out: string[] = []
    for (const m of text.matchAll(/(?:^|[^\w.])@([A-Za-z0-9._]{2,30})/g)) {
        const u = m[1].replace(/\.+$/, '')
        if (u && !out.includes(u)) out.push(u)
    }
    return out
}

const KST = 9 * 3600 * 1000
/** ISO → 「2026-10-03」 (서울 날짜) */
export function kstDay(iso: string | undefined): string {
    const t = iso ? Date.parse(iso) : NaN
    if (!Number.isFinite(t)) return ''
    return new Date(t + KST).toISOString().slice(0, 10)
}

const num = (n: number | undefined) => (typeof n === 'number' ? n.toLocaleString('ko-KR') : '')

const MEDIA_LABEL: Record<SocialMediaType, string> = { image: '사진', video: '영상', carousel: '여러 장' }
function mediaLabel(p: SocialPost): string {
    if (p.isReel) return '릴스'
    return p.mediaType ? MEDIA_LABEL[p.mediaType] : ''
}

/** 글 한 편을 봇이 읽을 글로 (머리 한 줄 + 해시태그 + 캡션). 숫자는 공개 화면에 나온 것만 */
export function formatSocialPost(p: SocialPost): string {
    const parts = [
        p.postedAt ? kstDay(p.postedAt) : '',
        mediaLabel(p),
        typeof p.likes === 'number' ? `좋아요 ${num(p.likes)}` : '',
        typeof p.comments === 'number' ? `댓글 ${num(p.comments)}` : '',
        typeof p.views === 'number' ? `조회 ${num(p.views)}` : '',
        p.imageUrls.length > 1 ? `사진 ${p.imageUrls.length}장` : '',
    ].filter(Boolean)
    const label = p.platform === 'instagram' ? '인스타그램 글' : '스레드 글'
    const head = `[${label}${parts.length ? ' ' + parts.join(', ') : ''}]`
    const tags = p.hashtags.length ? `\n해시태그: ${p.hashtags.map(t => '#' + t).join(' ')}` : ''
    return `${head}${tags}\n${p.text}`.trim()
}

/** 올리는 간격 (글 사이 평균 일수). 시각이 둘 이상 있어야 한다 */
export function postingGapDays(posts: readonly SocialPost[]): number | null {
    const ts = posts.map(p => (p.postedAt ? Date.parse(p.postedAt) : NaN)).filter(Number.isFinite).sort((a, b) => b - a)
    if (ts.length < 2) return null
    const gap = (ts[0] - ts[ts.length - 1]) / (ts.length - 1) / 86_400_000
    return Math.round(gap * 10) / 10
}

/** 자주 쓴 해시태그 순서 (같은 수면 먼저 나온 순) */
export function topHashtags(posts: readonly SocialPost[], n = 8): { tag: string; count: number }[] {
    const c = new Map<string, number>()
    for (const p of posts) for (const t of p.hashtags) c.set(t, (c.get(t) ?? 0) + 1)
    return [...c.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, n)
}

/** 계정 요약 (머리말). 봇이 「이 사람은 어떤 글에 반응을 얻는가」를 말할 수 있게 한다 */
export function formatSocialSummary(profile: SocialProfile | undefined, posts: readonly SocialPost[]): string {
    const lines: string[] = []
    if (profile) {
        const bits = [
            profile.followers != null ? `팔로워 ${num(profile.followers)}명` : '',
            profile.postsCount != null ? `게시물 ${num(profile.postsCount)}개` : '',
            profile.verified ? '인증 계정' : '',
        ].filter(Boolean)
        lines.push(`[인스타그램 계정] ${profile.name ? profile.name + ' ' : ''}(@${profile.username})${bits.length ? ' ' + bits.join(', ') : ''}`)
    }
    const dated = posts.filter(p => p.postedAt).sort((a, b) => Date.parse(b.postedAt!) - Date.parse(a.postedAt!))
    if (dated.length >= 2) {
        const gap = postingGapDays(dated)
        const kinds = (['image', 'carousel', 'video'] as SocialMediaType[]).map(k => {
            const n = posts.filter(p => p.mediaType === k).length
            return n ? `${MEDIA_LABEL[k]} ${n}개` : ''
        }).filter(Boolean)
        lines.push(`최근 글 ${posts.length}개는 ${kstDay(dated[dated.length - 1].postedAt)}부터 ${kstDay(dated[0].postedAt)}까지 올렸고${gap != null ? `, 평균 ${gap}일에 한 번 올려요` : ''}${kinds.length ? `. 종류: ${kinds.join(', ')}` : ''}`)
    }
    const tags = topHashtags(posts)
    if (tags.length) lines.push(`자주 쓰는 해시태그: ${tags.map(t => `#${t.tag}${t.count > 1 ? `(${t.count})` : ''}`).join(' ')}`)
    const liked = posts.filter(p => typeof p.likes === 'number').sort((a, b) => b.likes! - a.likes!)
    if (liked.length >= 2) {
        const avg = Math.round(liked.reduce((s, p) => s + p.likes!, 0) / liked.length)
        const top = liked[0]
        lines.push(`좋아요는 글마다 평균 ${num(avg)}개이고, 가장 많은 글은 ${top.postedAt ? kstDay(top.postedAt) + ' ' : ''}${mediaLabel(top)} ${num(top.likes)}개예요`)
    }
    return lines.join('\n')
}

/** 계정, 글 묶음 → 봇이 배울 글 하나. 글 사이는 --- 줄로 나눈다 (편 수를 세는 규칙과 같다) */
export function formatSocialText(profile: SocialProfile | undefined, posts: readonly SocialPost[]): string {
    const head = formatSocialSummary(profile, posts)
    const body = posts.map(formatSocialPost).join('\n\n---\n\n')
    return head ? `${head}\n\n${body}` : body
}

/** 인스타그램 사진 주소 끝 oe=16진수 = 만료 시각(초). 없으면 undefined */
export function imageExpiry(url: string): string | undefined {
    const m = url.match(/[?&]oe=([0-9a-f]{6,10})\b/i)
    if (!m) return undefined
    const sec = parseInt(m[1], 16)
    return Number.isFinite(sec) && sec > 1_000_000_000 ? new Date(sec * 1000).toISOString() : undefined
}
