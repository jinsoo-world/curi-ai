// domains/os — 요금제 표 (무료 / 베이직 월 29,000원 / 프로 월 99,000원)
//
// 대표 확정 0923: 「클로버를 충전하는 개념이고, 산 날동안 1년 쓸 수 있다 이런 문구는 빼.
//                  구독은 무료(기본) / 29,000원 / 99,000원 이렇게 2개 요금제로 해.」
// 같은 날 확정: 내 팀 봇과의 대화는 클로버 0(무료). 대신 주간 한도(usage.ts). 5시간 창 없음(대표 확정 0923).
//
// ⚠️ 각 요금제의 혜택 구성(봇 수·한도 배수·perks)은 부대표 추천(미확정). 대표 검수 필요.
//    가격 3개(0 / 29,000 / 99,000)만 대표 확정.
// ⚠️ 여기 limits 는 정의만 해 둔다. usage.ts 의 한도 상수를 요금제에 따라 바꾸는 연결은 다음 단계.
// 순수 값·계산만 여기. DB·브라우저는 만지지 않는다(시험이 쉽게).
import { USAGE_LIMIT_5H, USAGE_LIMIT_WEEK } from './usage'

export type PlanId = 'free' | 'basic' | 'pro'
export type PaidPlanId = Exclude<PlanId, 'free'>

export interface Plan {
    id: PlanId
    /** 화면 이름 */
    name: string
    /** 한 달 값(원). 무료는 0 */
    price: number
    /** 5시간 창 안에서 내 봇과 대화할 수 있는 횟수 */
    limit5h: number
    /** 한 주 대화 횟수 */
    limitWeek: number
    /** 만들 수 있는 봇 수. null = 무제한 */
    maxBots: number | null
    /** 화면에 한 줄씩 보이는 혜택 */
    perks: string[]
    /** 「가장 많이 골라요」 배지 */
    recommended?: boolean
}

export const PLANS: Plan[] = [
    {
        id: 'free',
        name: '무료',
        price: 0,
        limit5h: USAGE_LIMIT_5H,
        limitWeek: USAGE_LIMIT_WEEK,
        maxBots: 4,
        perks: [
            '봇 4개까지',
            `주에 ${USAGE_LIMIT_WEEK.toLocaleString()}번 대화`,
            '봇 마켓 둘러보기',
        ],
    },
    {
        id: 'basic',
        name: '베이직',
        price: 29000,
        limit5h: 100,   // 대표 확정 0923: 베이직 주 500번
        limitWeek: 500,
        maxBots: 10,
        recommended: true,
        perks: [
            '봇 10개까지',
            '한도 5배 (주에 500번)',
            '외부 연결 (노션, 슬랙, 카카오톡, 인스타그램, 큐리어스)',
            '아침 루틴',
            '그룹 대화',
        ],
    },
    {
        id: 'pro',
        name: '프로',
        price: 99000,
        limit5h: 300,   // 대표 확정 0923: 프로 주 1,500번
        limitWeek: 1500,
        maxBots: null,
        perks: [
            '봇 무제한',
            '한도 15배 (주에 1,500번)',
            '사진 첨부 10장',
            '봇끼리 전달',
            '우선 처리',
            '팀 공유 (준비 중)',
        ],
    },
]

export function getPlan(id: unknown): Plan | undefined {
    return PLANS.find(p => p.id === id)
}

export function isPlanId(v: unknown): v is PlanId {
    return typeof v === 'string' && PLANS.some(p => p.id === v)
}

/** 결제할 수 있는 요금제인가 (무료는 결제 대상이 아니다) */
export function isPaidPlanId(v: unknown): v is PaidPlanId {
    return isPlanId(v) && v !== 'free'
}

export interface PlanLimits {
    limit5h: number
    limitWeek: number
    maxBots: number | null
}

/** 요금제별 한도. 모르는 값은 무료 한도 */
export function planLimits(id: PlanId): PlanLimits {
    const p = getPlan(id) ?? PLANS[0]
    return { limit5h: p.limit5h, limitWeek: p.limitWeek, maxBots: p.maxBots }
}

/** 요금제 주문번호. 접두사 plan_<요금제>_ 로 클로버 주문(clover_…)과 갈린다 */
export function makePlanOrderId(planId: PaidPlanId, now: number = Date.now(), random: string = Math.random().toString(36).slice(2, 8)): string {
    return `plan_${planId}_${now}_${random}`
}

/** 주문번호에서 요금제를 알아낸다. 요금제 주문이 아니면 null */
export function planIdFromOrderId(orderId: string | null | undefined): PaidPlanId | null {
    if (!orderId) return null
    const m = /^plan_([a-z]+)_/.exec(orderId)
    return m && isPaidPlanId(m[1]) ? m[1] : null
}

/** 토스 결제창·영수증에 보이는 이름 */
export function planOrderName(planId: PaidPlanId): string {
    return `큐리AI ${getPlan(planId)!.name} 1개월`
}

/** 첫 달 결제 뒤 요금제가 끝나는 날 = 한 달 뒤 */
export function planExpiresAt(from: Date): Date {
    const d = new Date(from.getTime())
    d.setMonth(d.getMonth() + 1)
    return d
}

export interface PlanRow {
    plan: string | null
    expires_at: string | null
}

/** DB 행 → 지금 요금제. 행이 없거나·모르는 값·기한이 지났으면 무료 */
export function resolvePlan(row: PlanRow | null | undefined, now: Date = new Date()): { plan: PlanId; expiresAt: string | null } {
    if (!row || !isPlanId(row.plan) || row.plan === 'free') return { plan: 'free', expiresAt: null }
    if (row.expires_at) {
        const exp = new Date(row.expires_at)
        if (Number.isNaN(exp.getTime()) || exp.getTime() <= now.getTime()) return { plan: 'free', expiresAt: null }
        return { plan: row.plan, expiresAt: exp.toISOString() }
    }
    return { plan: row.plan, expiresAt: null }
}
