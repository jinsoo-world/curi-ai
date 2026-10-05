// domains/os: 「내 링크로 만들기」 화면과 서버가 같이 쓰는 것 (브라우저에서도 불러도 된다. 서버 전용 코드 없음)
//
// 대표 승인 0928 23:53 (리서치 S1, S3, S4). SNS, 블로그 링크를 넣으면 저장 없이 봇 초안을 만들어 보여 주고,
// 주인이 고친 뒤 「만들기」를 눌러야 봇이 생긴다. 근거가 없는 칸은 「추정」으로 표시한다.

import { isMarketHost } from '@/domains/home/link-guide'
import type { UnreadLink } from './link-rules'

/** 초안 요청 한도 (설정값). 사용자 하루 5번, 전체 하루 500번 */
export const TWIN_DRAFT_USER_DAILY = 5
export const TWIN_DRAFT_GLOBAL_DAILY = 500
/** 한 번에 넣는 링크, 붙여넣는 글 수 */
export const TWIN_DRAFT_MAX_LINKS = 3
export const TWIN_DRAFT_MAX_PASTES = 3

/** 필수 동의 2개 (S1). 둘 다 켜야 초안을 만든다. 리서치 파일 4.2 원문 그대로 (법무 검토 필요) */
export const TWIN_DRAFT_CONSENTS = [
    '(필수) 아래 링크는 제가 직접 운영하는 계정입니다. 이 계정의 글과 영상은 제가 만들었거나 쓸 권리가 있습니다.',
    '(필수) 큐리AI가 이 계정의 공개된 글과 영상만 읽어 제 봇의 자료와 소개 초안을 만드는 데 동의합니다.',
] as const

export const TWIN_DRAFT_COPY = {
    tab: '내 링크로 만들기',
    intro: '내 SNS, 블로그 링크로 나를 닮은 봇 초안을 만들어요',
    linkPlaceholder: 'https://youtube.com/@내채널',
    pasteLabel: '글 붙여넣기 (자동으로 못 읽을 때)',
    make: '초안 만들기',
    making: '글을 읽고 초안을 쓰는 중이에요',
    create: '이대로 만들기',
    guess: '추정',
    read: '가져온 자료',
    unread: '못 읽은 링크',
    /** 한도에 닿았을 때 (횟수는 보여 주지 않는다) */
    limit: '오늘은 초안을 더 만들 수 없어요. 내일 다시 해 주세요',
    busy: '지금 요청이 많아요. 내일 다시 해 주세요',
} as const

/** 링크 판별 (S1 화면 표시용). 서버의 classifySnsLink 와 같은 규칙을 가볍게 옮겼다 */
export type DraftLinkKind = 'read' | 'paste' | 'link' | 'bad'
export const DRAFT_LINK_LABEL: Record<DraftLinkKind, string> = {
    read: '읽어요',
    paste: '글 붙여넣기',
    link: '링크만 저장돼요',
    bad: '주소를 확인해 주세요',
}
export function draftLinkKind(raw: string): DraftLinkKind {
    const t = String(raw ?? '').trim()
    if (!t) return 'bad'
    let u: URL
    try { u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`) } catch { return 'bad' }
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return 'bad'
    const host = u.hostname.replace(/^(www|m)\./, '').toLowerCase()
    const is = (h: string) => host === h || host.endsWith(`.${h}`)
    // 인스타그램, 스레드는 공개 글이면 읽는다 (못 읽으면 이유와 붙여넣기 칸이 같은 화면에 뜬다)
    if (is('instagram.com') || is('threads.net') || is('threads.com')) return 'read'
    if (is('facebook.com') || is('fb.com')) return 'paste'
    // X, 링크드인은 읽지 않고 글 붙여넣기 안내만
    if (is('x.com') || is('twitter.com') || is('linkedin.com') || is('lnkd.in')) return 'paste'
    if (is('tiktok.com')) return 'link'
    if (isMarketHost(host)) return 'paste'
    return 'read'
}

/** 초안 한 벌 (편집 화면과 같은 칸 + 미리보기 정보) */
export interface TwinDraft {
    names: string[]
    name: string
    oneLiner: string
    greeting: string
    audience: string
    topics: string[]
    voiceRules: string[]
    limits: string[]
    chips: string[]
    example: { q: string; a: string }
    /** 예시 문답 2쌍까지 (example 은 첫 쌍) */
    examples?: { q: string; a: string }[]
    /** 자료에서 뽑은 구체적 사실 (from = 자료 번호, 1부터) */
    facts?: { text: string; from: number }[]
    /** 리더가 실제로 쓴 고유 표현, 말버릇 */
    phrases?: string[]
    /** 봇이 따를 설명 (twin.ts 로 조립, 말투 초안은 덧붙임) */
    prompt: string
    /** 근거 없이 추정한 칸 이름 */
    guessed: DraftField[]
    sources: { title: string; url: string; kind?: DraftSourceKind }[]
    /** 종류별로 읽은 개수 (화면 표시, 첫 인사용) */
    counts?: Partial<Record<DraftSourceKind, number>>
    unread: UnreadLink[]
}
export type DraftField = 'names' | 'oneLiner' | 'greeting' | 'audience' | 'topics' | 'voiceRules' | 'limits' | 'chips' | 'example'
export const DRAFT_FIELDS: readonly DraftField[] = ['names', 'oneLiner', 'greeting', 'audience', 'topics', 'voiceRules', 'limits', 'chips', 'example']

/** 모델이 쓴 글에서 가운데점, 긴 대시를 뺀다 (화면 문구 규칙) */
export function tidyLine(v: unknown, max: number): string {
    return String(v ?? '')
        .replace(/\s*[—–]\s*/g, ' ')
        .replace(/\s*·\s*/g, ', ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
}

/** 초안 만드는 동안 시간에 따라 바꿔 보여 주는 단계 (숫자, 남은 시간은 보여 주지 않는다) */
export const DRAFT_STEPS = [
    { at: 0, text: '링크를 여는 중이에요' },
    { at: 4_000, text: '글과 영상을 읽는 중이에요' },
    { at: 20_000, text: '말투를 배우는 중이에요' },
    { at: 38_000, text: '소개를 쓰는 중이에요' },
] as const
export function draftStepAt(ms: number): string {
    let t: string = DRAFT_STEPS[0].text
    for (const s of DRAFT_STEPS) if (ms >= s.at) t = s.text
    return t
}

/** 읽은 자료 종류 */
export type DraftSourceKind = 'blog' | 'youtube' | 'instagram' | 'threads' | 'paste' | 'web'
const KIND_ORDER: DraftSourceKind[] = ['blog', 'youtube', 'instagram', 'threads', 'web', 'paste']
const KIND_LABEL: Record<DraftSourceKind, { noun: string; unit: string }> = {
    blog: { noun: '블로그', unit: '글' },
    youtube: { noun: '유튜브', unit: '영상' },
    instagram: { noun: '인스타', unit: '글' },
    threads: { noun: '스레드', unit: '글' },
    web: { noun: '홈페이지', unit: '글' },
    paste: { noun: '붙여넣은', unit: '글' },
}
const KIND_PLACE: Record<DraftSourceKind, string> = {
    blog: '블로그', youtube: '영상', instagram: '인스타그램', threads: '스레드', web: '홈페이지', paste: '보내 주신 글',
}

export function draftSourceKind(url: string): DraftSourceKind {
    if (!url) return 'paste'
    let host = ''
    try { host = new URL(url).hostname.replace(/^(www|m)\./, '').toLowerCase() } catch { return 'web' }
    const is = (h: string) => host === h || host.endsWith(`.${h}`)
    if (is('youtube.com') || is('youtu.be')) return 'youtube'
    if (is('instagram.com')) return 'instagram'
    if (is('threads.net') || is('threads.com')) return 'threads'
    if (is('blog.naver.com') || is('tistory.com') || is('brunch.co.kr') || is('velog.io') || is('medium.com') || is('wordpress.com') || is('substack.com') || host.startsWith('blog.')) return 'blog'
    return 'web'
}

/** 종류별 개수 → 「블로그 글 3개」 같은 작은 표시 */
export function draftSourceChips(counts: Partial<Record<DraftSourceKind, number>>): string[] {
    return KIND_ORDER.filter(k => (counts[k] ?? 0) > 0).map(k => `${KIND_LABEL[k].noun} ${KIND_LABEL[k].unit} ${counts[k]}개`)
}

/** 만들 때 첫 인사 앞에 붙이는 「무엇을 배웠나」 한 줄 (모델 안 부름) */
export function learnedLine(ownerName: string, kinds: readonly string[]): string {
    const ks = KIND_ORDER.filter(k => kinds.includes(k))
    if (ks.length === 0) return ''
    const places = ks.map(k => KIND_PLACE[k])
    const joined = places.length === 1 ? places[0] : `${places.slice(0, -1).join(', ')}${withGwa(places[places.length - 2])} ${places[places.length - 1]}`
    return `${ownerName}님 ${joined}에서 말투와 주로 다루는 주제를 배웠어요. 무엇이든 물어보세요.`
}

/** 배운 것 한 줄 + 주인이 쓴 인사말 (200자 안에서, 배운 줄을 먼저 지킨다) */
export function composeGreeting(learned: string, typed: string): string {
    const t = String(typed ?? '').trim()
    if (!learned) return t.slice(0, 200)
    if (!t) return learned.slice(0, 200)
    return `${learned}\n${t}`.slice(0, 200)
}

/** 받침 있으면 「과」, 없으면 「와」 */
function withGwa(word: string): string {
    const c = word.charCodeAt(word.length - 1) - 0xac00
    return c >= 0 && c <= 11171 && c % 28 !== 0 ? '과' : '와'
}

/** 블로그 글 하나 주소면 그 주소 (네이버 글번호, 티스토리 글). 블로그 첫 화면, 피드 주소면 null */
export function postUrlOf(raw: string): string | null {
    let u: URL
    try { u = new URL(raw) } catch { return null }
    const host = u.hostname.replace(/^(www|m)\./, '').toLowerCase()
    if (host === 'blog.naver.com') {
        if (u.searchParams.get('logNo')) return raw
        return /^\/[A-Za-z0-9_-]{2,40}\/\d{5,}/.test(u.pathname) ? raw : null
    }
    if (host.endsWith('.tistory.com')) {
        const path = u.pathname.replace(/\/+$/, '')
        if (!path || /^\/(rss|feed|category|tag|guestbook|notice)(\/|$)/i.test(path)) return null
        return raw
    }
    // 브런치 글 하나 (/@작가/번호), 미디엄 글 하나 (끝 칸이 제목-12자리)
    if (host === 'brunch.co.kr') return /^\/@[^/]+\/\d+\/?$/.test(u.pathname) ? raw : null
    if (host === 'medium.com' || host.endsWith('.medium.com')) {
        const parts = u.pathname.split('/').filter(Boolean)
        if (parts[0] === 'p' && parts[1]) return raw
        const last = parts[parts.length - 1] ?? ''
        return parts.length >= (host === 'medium.com' ? 2 : 1) && /-[0-9a-f]{10,12}$/i.test(last) ? raw : null
    }
    return null
}
