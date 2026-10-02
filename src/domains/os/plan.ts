// domains/os — 요금제 표 (무료 / 베이직 월 9,900원 / 프로 월 39,000원)
//
// 대표 확정 0923: 「클로버를 충전하는 개념이고, 산 날동안 1년 쓸 수 있다 이런 문구는 빼.
//                  구독은 무료(기본) / 유료 2개 요금제로 해.」
// 대표 결정 1002: 가격을 베이직 29,000 → 9,900원, 프로 99,000 → 39,000원으로 내린다. 요금제 이름(id)은 그대로.
// 같은 날 확정: 내 팀 봇과의 대화는 클로버 0(무료). 한도는 대표 결정 0928 로 월간 하나(숫자는 usage-config.ts).
//
// ⚠️ 각 요금제의 봇 수·한도 배수는 부대표 추천(미확정). perks 글은 대표 지시 1003(코드에 있는 기능만 남김, 상담·사용 내역 보기는 출시 때 추가).
//    가격 3개(0 / 9,900 / 39,000)만 대표 확정(1002).
// 순수 값·계산만 여기. DB·브라우저는 만지지 않는다(시험이 쉽게).
import { MONTHLY_LIMITS } from './usage-config'

export type PlanId = 'free' | 'basic' | 'pro'
export type PaidPlanId = Exclude<PlanId, 'free'>

export interface Plan {
    id: PlanId
    /** 화면 이름 */
    name: string
    /** 한 달 값(원). 무료는 0 */
    price: number
    /** 한 달 답변 수 (usage-config.ts 의 MONTHLY_LIMITS) */
    limitMonth: number
    /** 만들 수 있는 봇 수. null = 무제한 */
    maxBots: number | null
    /** 화면에 한 줄씩 보이는 혜택. 답변 횟수는 쓰지 않는다(대표 지시 0929, 한도 숫자는 limitMonth 에만) */
    perks: string[]
    /** 광고 없음. 앱은 이 값이 false 일 때만 광고를 띄운다 (대표 결정 1002: 9,900원 베이직부터 광고 없음) */
    adFree: boolean
    /** 「가장 많이 골라요」 배지 */
    recommended?: boolean
}

export const PLANS: Plan[] = [
    {
        id: 'free',
        name: '무료',
        price: 0,
        limitMonth: MONTHLY_LIMITS.free,
        maxBots: 4,
        adFree: false,
        perks: [
            '가볍게 써 보기',
            '봇 마켓 둘러보기',
            '내 봇 1개 만들어 보기 (나만 보기)',
        ],
    },
    {
        id: 'basic',
        name: '베이직',
        price: 9900,
        limitMonth: MONTHLY_LIMITS.basic,
        maxBots: 10,
        adFree: true,
        recommended: true,
        perks: [
            '넉넉하게 쓰기',
            '광고 없이 쓰기',
            '아침 루틴',
            '그룹 대화',
            '내 봇 공개하고 수익 받기',
        ],
    },
    {
        id: 'pro',
        name: '프로',
        price: 39000,
        limitMonth: MONTHLY_LIMITS.pro,
        maxBots: null,
        adFree: true,
        perks: [
            '가장 넉넉하게 쓰기',
            '광고 없이 쓰기',
            '노션, 슬랙, 구글 드라이브 연결',
            '내 봇 수익 2배',
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
    limitMonth: number
    maxBots: number | null
}

/** 요금제별 한도. 모르는 값은 무료 한도 */
export function planLimits(id: PlanId): PlanLimits {
    const p = getPlan(id) ?? PLANS[0]
    return { limitMonth: p.limitMonth, maxBots: p.maxBots }
}

/** 광고 없는 요금제인가. 모르는 값은 무료(광고 있음) */
export function planAdFree(id: PlanId): boolean {
    return (getPlan(id) ?? PLANS[0]).adFree
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

/** 요금제 순서. 무료 < 베이직 < 프로 (PLANS 표 순서) */
export function planRank(id: PlanId): number {
    return PLANS.findIndex(p => p.id === id)
}

/** 지금 요금제에서 이 요금제를 결제할 수 있나. 위로만 올린다(내리면 남은 기간을 날린다) */
export function canBuyPlan(current: PlanId, target: PlanId): boolean {
    return isPaidPlanId(target) && planRank(target) > planRank(current)
}

/** 화면 가격 글자. 무료 「0원」, 유료 「월 9,900원」 */
export function planPriceText(p: Pick<Plan, 'price'>): string {
    return p.price === 0 ? '0원' : `월 ${p.price.toLocaleString('ko-KR')}원`
}

const KST_OFFSET_MS = 9 * 3_600_000

/**
 * 한 달 뒤 = 서울 날짜로 다음 달 같은 날, 같은 시각. 그런 날이 없으면 그 달 마지막 날
 * (1/31 → 2/28, 윤년 2/29 · 3/31 → 4/30). 그냥 setMonth 를 쓰면 1/31 → 3/3 으로 넘어갔다.
 */
export function planExpiresAt(from: Date): Date {
    const k = new Date(from.getTime() + KST_OFFSET_MS)
    const y = k.getUTCFullYear()
    const m = k.getUTCMonth() + 1
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
    const day = Math.min(k.getUTCDate(), lastDay)
    const out = Date.UTC(y, m, day, k.getUTCHours(), k.getUTCMinutes(), k.getUTCSeconds(), k.getUTCMilliseconds())
    return new Date(out - KST_OFFSET_MS)
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

export type PlanPeriod = { ok: true; expiresAt: Date } | { ok: false; reason: 'downgrade' | 'already' | 'store' }

/** 앱(아이폰·안드로이드)에서 구독 중인 사람이 웹 결제를 하려 할 때 (이중 결제 막기) */
export const STORE_SUBSCRIBED_MESSAGE = '앱에서 구독 중이에요. 앱스토어나 플레이스토어에서 먼저 해지해 주세요'

/** 올리기 전 안내 한 줄. 남은 기간을 돌려주지 않으므로 유료 → 더 높은 유료일 때만 보인다 */
export function upgradeNotice(current: PlanId, target: PlanId): string | null {
    if (current === 'free' || !canBuyPlan(current, target)) return null
    return `지금 쓰는 ${getPlan(current)!.name}의 남은 기간은 ${getPlan(target)!.name}로 바뀌면서 사라져요`
}

/**
 * 요금제 한 달 결제 뒤 끝나는 날.
 *   처음이거나 기한이 지났다 → 오늘부터 한 달
 *   같은 요금제를 남은 기간 중에 또 산다 → 남은 기간 끝에 한 달을 붙인다(두 번 사도 날리지 않는다)
 *   더 위 요금제로 올린다 → 오늘부터 한 달 (아래 요금제 남은 날은 계산해 돌려주지 않는다. 일할 계산 없음)
 *   더 아래 요금제로 내린다 → 막는다(돈 받기 전에)
 *   기한 없는 같은 요금제(직접 넣어 준 것)를 또 산다 → 막는다
 *   앱(레비뉴캣)에서 연 요금제가 살아 있다 → 막는다(스토어에서 먼저 해지)
 */
export function nextPlanPeriod(row: (PlanRow & { last_order_id?: string | null }) | null | undefined, target: PaidPlanId, now: Date = new Date()): PlanPeriod {
    const cur = resolvePlan(row, now)
    if (cur.plan !== 'free' && planSource(row?.last_order_id) === 'revenuecat') return { ok: false, reason: 'store' }
    if (cur.plan !== 'free' && planRank(cur.plan) > planRank(target)) return { ok: false, reason: 'downgrade' }
    if (cur.plan === target && !cur.expiresAt) return { ok: false, reason: 'already' }
    if (cur.plan === target && cur.expiresAt) return { ok: true, expiresAt: planExpiresAt(new Date(cur.expiresAt)) }
    return { ok: true, expiresAt: planExpiresAt(now) }
}

/** 요금제가 어디서 열렸나. last_order_id 접두사로 안다 (토스 plan_… / 앱 레비뉴캣 revenuecat:…) */
export type PlanSource = 'toss' | 'revenuecat'

export function planSource(lastOrderId: string | null | undefined): PlanSource | null {
    if (!lastOrderId) return null
    if (lastOrderId.startsWith('plan_')) return 'toss'
    if (lastOrderId.startsWith('revenuecat:')) return 'revenuecat'
    return null
}

export interface PlanEntitlement {
    plan: PlanId
    expiresAt: string | null
    adFree: boolean
    source: PlanSource | null
    limits: PlanLimits
}

/** 앱·웹이 같은 답을 보도록 지금 권한 한 묶음 (/api/billing/entitlement) */
export function planEntitlement(row: (PlanRow & { last_order_id?: string | null }) | null | undefined, now: Date = new Date()): PlanEntitlement {
    const r = resolvePlan(row, now)
    return {
        plan: r.plan,
        expiresAt: r.expiresAt,
        adFree: planAdFree(r.plan),
        source: r.plan === 'free' ? null : planSource(row?.last_order_id),
        limits: planLimits(r.plan),
    }
}
