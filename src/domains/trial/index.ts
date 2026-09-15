/**
 * 무료 체험권 — 받은 날부터 7일
 *
 * 대표 지시 2026-09-14 = 「무료체험권은 휴대폰 인증하게 해. 받은날로부터 7일은 세고 똑바로」
 *
 * 전에는 users.subscription_tier 를 'free_trial' 로 바꾸기만 하고 끝나는 날을
 * 어디에도 적지 않았다. 그래서 한 번 받으면 영원히 체험 중이었다.
 */
export const TRIAL_DAYS = 7

/** 추천한 사람에게 주는 클로버 — 대표 확정 2026-09-15 「50개 드린다고 할까?」 */
export const REFERRER_REWARD = 50

/**
 * 휴대폰 인증을 한 사람에게 주는 클로버
 *
 * 대표 확정 2026-09-15 「7일 무료체험도 없애야지 그러면」
 * 「7일 무료 체험」은 사진 도구에 아무 혜택이 없었다(도구 서버 어디에도 체험권을 보는 줄이 없다).
 * 이름만 있는 약속이라 걷어냈다. 휴대폰 인증은 남긴다 — 한 사람이 여러 번 받는 것을 막는 장치다.
 * 보상은 초대(50개)와 같은 자리에 두었다.
 */
export const TRIAL_CLOVERS = 50

/**
 * 가입 선물 — 대표 확정 2026-09-15 「가입하면 60개지 뭔 100개야」 → 같은 날 「60개가 아니라 40개로 해야겠구만」
 * (오전 100 → 60 → 40. 사진 한 장에 20개이므로 40개 = 두 장)
 *
 * 전에는 가입 창구가 10,000개(25만원어치)를 주도록 되어 있었다. 실제로 나간 적은 없지만
 * 값이 두 개로 갈려 있었다. 이제 선물은 전부 여기 숫자 하나를 본다.
 */
export const SIGNUP_CLOVERS = 40

/**
 * 가입 안 한 손님에게 주는 클로버 — 대표 확정 2026-09-15
 * 「클로버 60개를 주면 되잖아」 → 「60개가 아니라 40개로」 (사진 두 장)
 *
 * 전에는 「하루 3장」이라는 따로 도는 셈을 썼다. 그래서 화면에 클로버가 0으로 보이는데
 * 사진은 만들어져 헷갈렸다. 이제 손님도 회원과 같은 자로 잰다.
 * 하루가 지나면 다시 채워진다.
 */
export const GUEST_CLOVERS = 40

/** 체험을 시작하면 끝나는 시각을 정확히 계산한다 */
export function trialEndsAt(from: Date = new Date()): Date {
    const end = new Date(from.getTime())
    end.setDate(end.getDate() + TRIAL_DAYS)
    return end
}

/** 지금 체험 중인가 */
export function isTrialActive(trialEnds: string | null | undefined, now: Date = new Date()): boolean {
    if (!trialEnds) return false
    const t = new Date(trialEnds).getTime()
    return Number.isFinite(t) && t > now.getTime()
}

/** 며칠 남았나 — 화면에 쓴다. 0.1일도 「1일 남음」으로 센다 */
export function trialDaysLeft(trialEnds: string | null | undefined, now: Date = new Date()): number {
    if (!trialEnds) return 0
    const ms = new Date(trialEnds).getTime() - now.getTime()
    if (!Number.isFinite(ms) || ms <= 0) return 0
    return Math.ceil(ms / (24 * 60 * 60 * 1000))
}
