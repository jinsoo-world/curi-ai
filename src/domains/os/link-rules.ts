// domains/os: 링크와 글 넣기의 공통 규칙 (브라우저, 서버 모두 쓴다. 서버 전용 코드 없음).
// 대표 지시 1005 「들어가는 길마다 규칙이 달랐다」: 붙여넣기 최소 글자, 못 읽은 이유 문구, 「다시 시도」, 읽은 결과 한 줄을
// 여기 한 곳에 둔다. OsMake, 옛 만들기 창, 설정, 자료 넣기 창, 서버가 모두 이것을 쓴다.
// 화면 문구 규칙: 짧은 쉬운 한국어, 가운데점과 긴 대시 없음, 한도 숫자 없음.

/** 붙여넣은 글, 읽어 온 글이 이만큼은 돼야 자료가 된다 (공백 뺀 글자 수). 어느 입구든 같다 */
export const MIN_TEXT_CHARS = 30
/** 한 편으로 받는 글자 상한 */
export const MAX_PASTE_CHARS = 20_000
/** 한 번에 붙여넣는 글 수 */
export const MAX_PASTE_POSTS = 3

export const RETRY_LABEL = '다시 시도'
export const PASTE_OPEN_LABEL = '글 붙여넣기'
export const TOO_SHORT_LINE = '글이 너무 짧아요. 조금 더 길게 붙여넣어 주세요'
export const PASTE_HELP_LINE = '글을 붙여넣거나 화면 캡처를 올려 주세요'

/** 글 길이가 충분한가 (공백 뺀 글자 수) */
export function enoughText(t: unknown): boolean {
    return String(t ?? '').replace(/\s+/g, '').length >= MIN_TEXT_CHARS
}

/**
 * 못 읽은 이유 갈래. 서버가 정하고 화면은 이 코드로 「다시 시도」, 「붙여넣기」를 보여 준다.
 *   not_public  비공개이거나 주소가 달라요  → 붙여넣기
 *   blocked     그쪽에서 막고 있어요        → 다시 시도, 붙여넣기
 *   timeout     시간이 걸렸어요             → 다시 시도
 *   empty       읽을 글이 없었어요          → 붙여넣기
 *   profile_only 스레드 계정은 소개만       → 글 주소 또는 붙여넣기
 *   link_only   링크만 저장하는 곳          → 붙여넣기
 *   paste       이 곳은 붙여넣기로 받아요   → 붙여넣기
 *   bad_url     주소가 이상해요             → 주소 고치기
 *   full        자료 칸이 가득               → 자료 빼기
 */
export type LinkFailCode = 'not_public' | 'blocked' | 'timeout' | 'empty' | 'profile_only' | 'link_only' | 'paste' | 'bad_url' | 'full' | 'unknown'

export const RETRYABLE: readonly LinkFailCode[] = ['blocked', 'timeout', 'unknown', 'empty']
export const PASTEABLE: readonly LinkFailCode[] = ['not_public', 'blocked', 'timeout', 'empty', 'profile_only', 'link_only', 'paste', 'unknown']

export const canRetry = (code: LinkFailCode | undefined): boolean => !code || RETRYABLE.includes(code)
export const canPaste = (code: LinkFailCode | undefined): boolean => !code || PASTEABLE.includes(code)

export function isLinkFailCode(v: unknown): v is LinkFailCode {
    return typeof v === 'string' && ['not_public', 'blocked', 'timeout', 'empty', 'profile_only', 'link_only', 'paste', 'bad_url', 'full', 'unknown'].includes(v)
}

/** 읽지 못한 링크 하나 (서버가 돌려주고, 화면이 그대로 그린다) */
export interface UnreadLink { url: string; reason: string; code?: LinkFailCode }

export const FULL_LINE = '자료 칸이 가득 찼어요. 안 쓰는 자료를 빼고 다시 해 주세요'

/** 읽기 결과를 화면용 한 줄로 (예: 「인스타 글 5개를 읽었어요」). 종류별 칩 문구를 받아 이어 붙인다 */
export function readSummaryLine(chips: readonly string[]): string {
    if (chips.length === 0) return ''
    return `${chips.join(', ')}를 읽었어요`
}

/** 읽기 이유 글에서 갈래를 가린다 (서버가 갈래를 못 준 옛 문구용) */
export function failCodeOfReason(reason: string): LinkFailCode {
    if (/시간|오래/.test(reason)) return 'timeout'
    if (/막고|막아|열리지|robots/.test(reason)) return 'blocked'
    if (/비공개|달라요/.test(reason)) return 'not_public'
    if (/주소.*(확인|이상)/.test(reason)) return 'bad_url'
    if (/가득|다 찼/.test(reason)) return 'full'
    if (/링크만/.test(reason)) return 'link_only'
    if (/붙여/.test(reason)) return 'paste'
    if (/읽을 글|찾지 못|못 찾/.test(reason)) return 'empty'
    return 'unknown'
}

/**
 * 블로그, 채널 한 곳을 가리키는 열쇠. 같은 곳의 글은 자료 칸 하나로 센다(대표 지시 1005 「글 5개가 칸 10개를 다 먹는다」).
 * 네이버 블로그 = 아이디, 티스토리, Substack = 주소 이름, 브런치, 벨로그, 미디엄 = @계정. 그 밖은 null (글마다 칸 하나)
 */
export function accountKeyOf(raw: string | null | undefined): string | null {
    let u: URL
    try { u = new URL(String(raw ?? '')) } catch { return null }
    const host = u.hostname.replace(/^(www|m)\./, '').toLowerCase()
    const parts = u.pathname.split('/').filter(Boolean)
    const clean = (v: string) => decodeURIComponent(v).replace(/\.xml$/i, '').toLowerCase()
    if (host === 'blog.naver.com' || host === 'rss.blog.naver.com') {
        const id = clean(u.searchParams.get('blogId') || parts[0] || '')
        return /^[a-z0-9_-]{2,40}$/.test(id) ? `naver:${id}` : null
    }
    if (host.endsWith('.tistory.com') && host !== 'tistory.com') return `tistory:${host}`
    if (host.endsWith('.substack.com') && host !== 'substack.com') return `substack:${host}`
    if ((host === 'brunch.co.kr' || host === 'velog.io' || host === 'medium.com') && parts[0]?.startsWith('@')) return `${host.split('.')[0]}:${clean(parts[0])}`
    return null
}

/** 주소 → 곳 이름 (화면용, 서버 코드 없이). 모르면 사이트 이름 */
export function linkLabelOf(raw: string): string {
    let host = ''
    try { host = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase().replace(/^(www|m)\./, '') } catch { return '링크' }
    const is = (h: string) => host === h || host.endsWith(`.${h}`)
    if (is('instagram.com')) return '인스타그램'
    if (is('threads.net') || is('threads.com')) return '스레드'
    if (is('youtube.com') || is('youtu.be')) return '유튜브'
    if (is('blog.naver.com') || is('naver.com')) return '네이버 블로그'
    if (is('tistory.com')) return '티스토리'
    if (is('brunch.co.kr')) return '브런치'
    if (is('facebook.com') || is('fb.com')) return '페이스북'
    return host || '링크'
}
