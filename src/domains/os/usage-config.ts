// domains/os: 사용 한도와 결제 화면 문구 설정값 (대표 결정 0928 23:42)
//
// 한도는 월간 사용량 하나로 센다. 주 단위 한도와 5시간 창은 없앴다.
// 숫자와 문구는 여기만 바꾸면 화면, 대화 막기, 결제 화면이 같이 바뀐다.
// 결제 금액과 과금 로직은 plan.ts 와 결제 경로에 그대로 있고, 여기서는 건드리지 않는다.

import type { PlanId } from './plan'

/** 요금제별 한 달 답변 수 (서울 기준 매달 1일 0시에 다시 채워짐). 기본값: 무료 30, 베이직 370, 프로 1,250 */
export const MONTHLY_LIMITS: Record<PlanId, number> = {
    free: 30,
    basic: 370,
    pro: 1250,
}

/** 월간 한도로 바꾼 시점. 이 시각 전에 쓴 대화는 이번 달 사용량에 넣지 않는다(바꾸는 날 갑자기 막히는 사람이 없게).
 *  서울 기준 2026-09-29 0시. 다음 달(10월)부터는 매달 1일 0시부터 센다. */
export const MONTHLY_COUNT_SINCE = '2026-09-28T15:00:00Z'

/** 이만큼 쓰면 대화 안에 미리 알림 카드를 띄운다(퍼센트) */
export const USAGE_WARN_PCT = 80

// ── 클로버 이어 쓰기 (요금 정책 rev5 A안, 대표 승인 0928 23:53 켬) ──
// 순서: 월 한도를 먼저 쓰고, 다 쓴 뒤에만 클로버(내 팀 봇, 리더 봇 같음).
// CLOVER_OVERAGE_ENABLED 가 false 인 동안은 지금 운영 동작 그대로다(대화에서 클로버를 빼지 않고, 한도에 닿으면 막음).
// 켜면: 한도 소진 순간 확인 창, 설정의 「묻지 않고 이어 쓰기」, 충전 묶음 옆 답변 횟수, 바뀐 안내 문구가 같이 켜진다.

/** 클로버 이어 쓰기 스위치. 대표 승인 0928 23:53. false 로 돌리면 옛 동작(한도에서 막기만) */
export const CLOVER_OVERAGE_ENABLED: boolean = true

/** 행동별 클로버 소모량 (rev5 권장표) */
export const CLOVER_COST = {
    /** 텍스트 답변 1회 (길이 무관) */
    text: 5,
    /** 기본 음성 답변 1회 (텍스트 포함) */
    voice: 10,
    /** 클론 음성 답변 1회 (텍스트 포함) */
    cloneVoice: 15,
    /** 사진 첨부 답변 1회 */
    photoAnswer: 15,
    /** 자료 넣기 1쪽 (요금제 포함분 초과) */
    knowledgePage: 6,
    /** 이미지 만들기 1장 (기존 값 유지, 실제 차감은 사진 도구 PHOTO_COST) */
    imageGen: 20,
} as const

/** 한도를 넘긴 대화 1번에 쓰는 클로버. 스위치가 꺼져 있으면 옛 상수(legacy)를 그대로 돌려준다(지금은 어디서도 빼지 않음) */
export function chatCloverCost(opts: { photo?: boolean } = {}, legacy = 100): number {
    if (!CLOVER_OVERAGE_ENABLED) return legacy
    return opts.photo ? CLOVER_COST.photoAnswer : CLOVER_COST.text
}

/**
 * 대화 한 번을 어떻게 할지 (순서 = 월 한도 먼저, 다 쓴 뒤에만 클로버).
 *   free   = 한도 안. 클로버를 빼지 않는다
 *   charge = 한도를 다 썼고 사용자가 이어 쓰기를 골랐다. 답 만들기 전에 클로버를 뺀다
 *   ask    = 한도를 다 썼고 아직 안 물었다. 확인 창을 띄운다
 *   block  = 스위치가 꺼져 있다. 옛 동작대로 막는다
 */
export type OverageStep = 'free' | 'charge' | 'ask' | 'block'
export function overageStep(a: { blocked: boolean; cloverOk?: unknown }, enabled: boolean = CLOVER_OVERAGE_ENABLED): OverageStep {
    if (!a.blocked) return 'free'
    if (!enabled) return 'block'
    return a.cloverOk === true ? 'charge' : 'ask'
}

export const OVERAGE_COPY = {
    /** 한도 소진 순간 한 번 묻는 창 (횟수, 개수 안 보임) */
    confirm: '이번 달 사용량을 모두 쓰셨어요. 이어서 쓰시면 클로버가 쓰여요.',
    continueBtn: '클로버로 이어 쓰기',
    waitBtn: '다음 달까지 기다리기',
    /** 설정 한 줄 (기본 꺼짐) */
    autoSetting: '한도가 끝나면 묻지 않고 클로버로 이어 쓰기',
    /** 클로버가 모자랄 때 */
    short: '클로버가 모자라요. 충전하면 이어서 쓸 수 있어요.',
}

/** 클로버 안내 한 줄 (결제 화면 잔액 아래). 스위치에 따라 바뀐다 */
export function cloverBalanceNote(): string {
    return CLOVER_OVERAGE_ENABLED ? '이번 달 한도 안에서는 클로버를 쓰지 않아요' : '대화는 클로버를 쓰지 않아요'
}

/** 충전 묶음 옆 답변 횟수는 보이지 않는다 (대표 지시 0929 00:13, 횟수 표기 금지). 늘 빈 값 */
export function packAnswerHint(clovers: number): string {
    void clovers
    return ''
}

/** 「묻지 않고 이어 쓰기」 저장 열쇠 (브라우저) */
export const CLOVER_AUTO_KEY = 'os-clover-auto'

export function readCloverAuto(store: Pick<Storage, 'getItem'> | null | undefined): boolean {
    if (!CLOVER_OVERAGE_ENABLED || !store) return false
    try { return store.getItem(CLOVER_AUTO_KEY) === '1' } catch { return false }
}

/** 화면 문구. {n} 은 퍼센트로 바뀐다. 빈 문자열이면 그 줄은 안 보인다.
 *  대표 지시 0929 00:13: 고객 화면에 남은 횟수를 보여 주지 않는다. 퍼센트와 원형만. */
export const USAGE_COPY = {
    /** 사용량 창 첫 줄, 설정 */
    remaining: '이번 달 사용량 {n}%',
    /** 왼쪽 아래 원형 옆 */
    caption: '이번 달 {n}% 사용',
    /** 80% 알림 카드 */
    warnCard: '이번 달 사용량이 {n}%예요',
    /** 한도 도달 카드 */
    limitCard: '이번 달 사용량을 모두 쓰셨어요',
    /** 두 카드 공통 단추 */
    cardButton: '요금제 보기',
}

/** /os/charge 요금제 카드마다 한 줄 이유 (D3 대표 결정 전이라 비움. 빈 값이면 안 보인다) */
export const PLAN_REASON: Record<PlanId, string> = {
    free: '',
    basic: '',
    pro: '',
}

/** /os/charge 결제 단추 바로 앞 청약철회 안내 (요금 정책 rev5 B-2 짧은 판, 법무 확인 권장). 빈 값이면 그 줄은 안 보인다.
 *  연 요금제 문구는 연 요금제를 열 때 넣는다(지금은 없음). */
export const REFUND_NOTICE = {
    plan: '결제한 날부터 7일 안에 한 번도 쓰지 않으셨으면 전액 돌려드립니다. 7일 안에 일부 쓰셨으면 남은 답변 수만큼 돌려드리고, 이미 받은 답변은 돌려드릴 수 없습니다. 해지하시면 다음 결제부터 멈춥니다.',
    clover: '산 날부터 7일 안에 한 개도 쓰지 않으셨으면 전액 돌려드립니다. 일부 쓰셨으면 남은 클로버만큼 돌려드리고, 이벤트나 선물로 받은 클로버는 돌려드리지 않습니다. 정기 결제가 아닙니다.',
    /** 결제 단추 앞 필수 확인. 체크해야 결제 단추가 눌린다 */
    agree: '[필수] 결제 후 쓰기 시작한 답변과 클로버는 돌려받을 수 없고, 쓰지 않은 부분은 7일 안에 돌려받을 수 있다는 안내를 확인했습니다.',
}

/** {n} 자리 채우기 */
export function fillCopy(tpl: string, n: number): string {
    return tpl.replace('{n}', n.toLocaleString('ko-KR'))
}
