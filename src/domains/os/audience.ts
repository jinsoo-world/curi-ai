// domains/os — Audience(누가 이 봇과 대화할 수 있나) + 방문자 한도 매핑
//
// 델파이 문법 그대로 4단계(help.delphi.ai/articles/16042964-settings,
// help.delphi.ai/articles/16044116-integration-usage-limits 참고):
//   Just Me   = 나(주인)만.
//   Insiders  = 내가 초대한 사람 · 내 접근 그룹(access_groups)에 든 사람만.
//   Public    = 로그인한 누구나. 마켓에도 보인다.
//   Anonymous = 로그인 없이도. 원래는 「공개」 표시된 자료만 답해야 하는데,
//               자료 표(knowledge_sources)에 아직 공개 칸이 없어 지금은 전부 허용한다 — 리스크로 남긴다(설계 §3).
//
// 순수 계산만 여기. DB 읽기·쓰기는 audience-db.ts.

export type AudienceLevel = 'just_me' | 'insiders' | 'public' | 'anonymous'

export const AUDIENCE_LEVELS: readonly AudienceLevel[] = ['just_me', 'insiders', 'public', 'anonymous']

export const AUDIENCE_LABEL: Record<AudienceLevel, string> = {
    just_me: '나만',
    insiders: '초대한 사람만',
    public: '로그인한 누구나',
    anonymous: '로그인 없이도',
}

/** 라디오 아래 한 줄 설명 */
export const AUDIENCE_DESC: Record<AudienceLevel, string> = {
    just_me: '나만 이 봇과 대화할 수 있어요',
    insiders: '내가 접근 그룹에 넣은 사람만 대화할 수 있어요',
    public: '로그인한 사람이면 누구나 대화할 수 있고, 봇 마켓에도 보여요',
    anonymous: '로그인하지 않은 손님도 대화할 수 있어요',
}

export function isAudienceLevel(v: unknown): v is AudienceLevel {
    return typeof v === 'string' && (AUDIENCE_LEVELS as readonly string[]).includes(v)
}

/** bot_audience 표에 행이 없을 때 기본값. 마켓에 공개된 봇(mentors.is_active=true)은 Public, 그 외(내 팀 개인 봇)는 Just Me */
export function defaultAudienceLevel(isMarketPublic: boolean): AudienceLevel {
    return isMarketPublic ? 'public' : 'just_me'
}

export interface AudienceCheckInput {
    level: AudienceLevel
    /** 이 봇의 주인 본인인가. 주인은 어느 단계여도 항상 통과 */
    isOwner: boolean
    isLoggedIn: boolean
    /** level === 'insiders' 일 때, 이 방문자가 접근 그룹에 들어 있나 */
    inAllowedGroup: boolean
}

export type AudienceBlockReason = 'just_me_blocked' | 'insiders_blocked' | 'login_required'

export interface AudienceCheckResult {
    allowed: boolean
    reason: AudienceBlockReason | null
    /** 막혔을 때 사람 말. 통과하면 null */
    message: string | null
}

/** 이 사람이 이 봇과 대화해도 되나 (순수 판정. 재료는 audience-db.ts 가 만들어 넘긴다) */
export function checkAudience(i: AudienceCheckInput): AudienceCheckResult {
    if (i.isOwner) return { allowed: true, reason: null, message: null }
    switch (i.level) {
        case 'just_me':
            return { allowed: false, reason: 'just_me_blocked', message: '이 봇은 주인만 대화할 수 있어요' }
        case 'insiders':
            if (i.inAllowedGroup) return { allowed: true, reason: null, message: null }
            return { allowed: false, reason: 'insiders_blocked', message: '초대받은 사람만 대화할 수 있어요' }
        case 'public':
            if (i.isLoggedIn) return { allowed: true, reason: null, message: null }
            return { allowed: false, reason: 'login_required', message: '로그인하면 대화할 수 있어요' }
        case 'anonymous':
            return { allowed: true, reason: null, message: null }
        default:
            return { allowed: false, reason: 'just_me_blocked', message: '이 봇은 주인만 대화할 수 있어요' }
    }
}

/**
 * 방문자 1인당 주간 한도 = 큐리 요금제 한도(방문자 자신의 등급)와 봇 주인이 정한 「방문자 1인당 주 N번」 중 작은 값.
 * ownerVisitorLimit 이 없으면(null/undefined = 정해 둔 게 없음) 요금제 한도만 적용한다.
 * (내 팀 봇 자신과의 대화는 이 함수를 타지 않는다 — 클로버 0 · 내 요금제 한도, domains/os/usage.ts)
 */
export function visitorWeeklyLimit(planLimitWeek: number, ownerVisitorLimit: number | null | undefined): number {
    if (ownerVisitorLimit == null) return planLimitWeek
    return Math.max(0, Math.min(planLimitWeek, ownerVisitorLimit))
}

/** 화면 입력값(문자열 포함) → 표에 넣을 값. 빈 값·0 이하·숫자 아님은 "한도 없음"(null) */
export function cleanVisitorLimit(v: unknown): number | null {
    if (v === '' || v === null || v === undefined) return null
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) return null
    return Math.floor(n)
}
