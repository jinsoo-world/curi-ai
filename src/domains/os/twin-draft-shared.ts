// domains/os: 「내 링크로 만들기」 화면과 서버가 같이 쓰는 것 (브라우저에서도 불러도 된다. 서버 전용 코드 없음)
//
// 대표 승인 0928 23:53 (리서치 S1, S3, S4). SNS, 블로그 링크를 넣으면 저장 없이 봇 초안을 만들어 보여 주고,
// 주인이 고친 뒤 「만들기」를 눌러야 봇이 생긴다. 근거가 없는 칸은 「추정」으로 표시한다.

import { isMarketHost } from '@/domains/home/link-guide'

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
    if (is('instagram.com') || is('threads.net') || is('threads.com') || is('facebook.com') || is('fb.com')) return 'paste'
    if (is('x.com') || is('twitter.com') || is('tiktok.com')) return 'link'
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
    /** 봇이 따를 설명 (twin.ts 로 조립, 말투 초안은 덧붙임) */
    prompt: string
    /** 근거 없이 추정한 칸 이름 */
    guessed: DraftField[]
    sources: { title: string; url: string }[]
    unread: { url: string; reason: string }[]
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
