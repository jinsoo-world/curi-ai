// 어디서 왔나 이름 붙이기 (순수 함수). 광고비 판단용 관리자 화면과 시험이 같이 쓴다.
// 화면 문구에는 가운뎃점과 긴 줄표를 쓰지 않는다.

/** 이 날부터 직접 들어온 방문도 방문 기록에 남긴다. 그 전에는 utm 이나 바깥 링크가 있는 방문만 남았다 */
export const FULL_VISIT_TRACKING_SINCE = '2026-10-05'

/** 로그인하러 갔다 돌아온 것은 유입이 아니다 */
const AUTH_HOSTS = /(^|\.)(accounts\.google\.com|kauth\.kakao\.com|accounts\.kakao\.com|appleid\.apple\.com|nid\.naver\.com|id\.kakao\.com)$/i

export function hostOf(referrer: string | null | undefined): string | null {
    if (!referrer) return null
    try { return new URL(referrer).hostname.replace(/^www\./, '').toLowerCase() } catch { return null }
}

export function isAuthReturn(referrer: string | null | undefined): boolean {
    const h = hostOf(referrer)
    return !!h && AUTH_HOSTS.test(h)
}

/** 바깥 사이트 주소를 사람이 읽는 이름으로 */
const HOST_NAMES: [RegExp, string][] = [
    [/^(chatgpt\.com|chat\.openai\.com|openai\.com)$/, 'chatgpt'],
    [/^gemini\.google\.com$/, 'gemini'],
    [/(^|\.)perplexity\.ai$/, 'perplexity'],
    [/^claude\.ai$/, 'claude'],
    [/(^|\.)(copilot\.microsoft\.com)$/, 'copilot'],
    [/(^|\.)instagram\.com$/, 'instagram'],
    [/(^|\.)threads\.(net|com)$/, 'threads'],
    [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'facebook'],
    [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
    [/^(t\.co|twitter\.com|x\.com|mobile\.twitter\.com)$/, 'x'],
    [/^(m\.)?blog\.naver\.com$/, 'naver 블로그'],
    [/(^|\.)naver\.com$/, 'naver'],
    [/(^|\.)(daum\.net|kakao\.com)$/, 'kakao'],
    [/(^|\.)tistory\.com$/, 'tistory'],
    [/(^|\.)google\.[a-z.]+$/, 'google'],
    [/(^|\.)bing\.com$/, 'bing'],
    [/(^|\.)linkedin\.com$/, 'linkedin'],
    [/(^|\.)band\.us$/, 'band'],
]

export function hostName(host: string): string {
    for (const [re, name] of HOST_NAMES) if (re.test(host)) return name
    return host
}

export interface TouchLike {
    utm_source?: string | null
    utm_medium?: string | null
    utm_campaign?: string | null
    referrer?: string | null
    ref_code?: string | null
}

const clean = (v: string | null | undefined, n = 60) => {
    const s = (v ?? '').trim().toLowerCase()
    return s ? s.slice(0, n) : ''
}

/** 채널 = utm_source > 추천 링크 > 바깥 사이트 > 직접 */
export function channelOf(t: TouchLike): string {
    const s = clean(t.utm_source)
    if (s) return s
    if (clean(t.ref_code)) return '추천 링크'
    const h = hostOf(t.referrer)
    if (h && !isAuthReturn(t.referrer)) return hostName(h)
    return '직접'
}

/** 캠페인 = utm_campaign. 채널과 함께 보여 준다 */
export function campaignOf(t: TouchLike): string {
    const c = clean(t.utm_campaign, 80)
    return `${channelOf(t)} / ${c || '캠페인 없음'}`
}

export interface DeviceLike { device?: string | null; os?: string | null; app_shell?: string | null }

export const UNKNOWN_DEVICE = '알 수 없음'

export function deviceOf(d: DeviceLike): string {
    if (d.app_shell === 'ios_app') return 'iOS 앱'
    if (d.app_shell === 'android_app') return 'Android 앱'
    if (d.device === 'pc') return 'PC'
    if (d.device === 'mobile') {
        if (d.os === 'ios') return '모바일 iOS 웹'
        if (d.os === 'android') return '모바일 Android 웹'
        return '모바일 기타'
    }
    return UNKNOWN_DEVICE
}

/** 서버에서 사람 아닌 방문을 거른다 */
export function looksLikeBot(ua: string | null | undefined): boolean {
    if (!ua) return true
    return /bot\b|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|preview|monitor|uptime|curl\/|python-requests|node-fetch|axios|go-http|vercel-screenshot/i.test(ua)
}
