// 큐리 AI — 토스페이먼츠 서버 유틸리티
// 시크릿 키는 서버에서만 사용 (API Routes)

const TOSS_API_BASE = 'https://api.tosspayments.com/v1'
/** 토스 호출 마감. 토스가 멈춰도 결제 창구·자동결제 예약 작업이 통째로 멈추지 않게 (2026-10-06) */
export const TOSS_TIMEOUT_MS = 10_000
const tossSignal = () => AbortSignal.timeout(TOSS_TIMEOUT_MS)

/** 토스가 준 오류 코드(ALREADY_PROCESSED_PAYMENT 등)를 오류에 같이 싣는다 */
function tossError(message: string, body: unknown): Error {
    const code = (body as { code?: unknown } | null)?.code
    return Object.assign(new Error(message), { code: typeof code === 'string' ? code : undefined })
}

function getAuthHeader(): string {
    const secretKey = process.env.TOSS_SECRET_KEY
    if (!secretKey) throw new Error('TOSS_SECRET_KEY 환경변수가 설정되지 않았습니다.')
    // 시크릿 키 + ':' → base64 인코딩
    const encoded = Buffer.from(`${secretKey}:`).toString('base64')
    return `Basic ${encoded}`
}

/**
 * 빌링키 발급
 * @param authKey - 결제창 인증 후 받은 authKey
 * @param customerKey - 고객 고유 키 (user.id 사용)
 */
export async function issueBillingKey(authKey: string, customerKey: string) {
    const res = await fetch(`${TOSS_API_BASE}/billing/authorizations/issue`, {
        method: 'POST',
        headers: {
            Authorization: getAuthHeader(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ authKey, customerKey }),
        signal: tossSignal(),
    })

    if (!res.ok) {
        const error = await res.json()
        throw new Error(`빌링키 발급 실패: ${error.message || JSON.stringify(error)}`)
    }

    return res.json() as Promise<{
        billingKey: string
        customerKey: string
        cardCompany: string
        cardNumber: string
        authenticatedAt: string
    }>
}

/**
 * 빌링키로 자동결제 승인
 */
export async function chargeBilling(
    billingKey: string,
    customerKey: string,
    amount: number,
    orderId: string,
    orderName: string,
) {
    const res = await fetch(`${TOSS_API_BASE}/billing/${billingKey}`, {
        method: 'POST',
        headers: {
            Authorization: getAuthHeader(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            customerKey,
            amount,
            orderId,
            orderName,
        }),
        signal: tossSignal(),
    })

    if (!res.ok) {
        const error = await res.json()
        throw tossError(`결제 승인 실패: ${error.message || JSON.stringify(error)}`, error)
    }

    return res.json() as Promise<{
        paymentKey: string
        orderId: string
        status: string
        totalAmount: number
        approvedAt: string
        receipt: { url: string } | null
        card: {
            company: string
            number: string
        } | null
    }>
}

/**
 * 빌링키 삭제
 */
export async function deleteBillingKey(billingKey: string) {
    const res = await fetch(`${TOSS_API_BASE}/billing/${billingKey}`, {
        method: 'DELETE',
        headers: {
            Authorization: getAuthHeader(),
            'Content-Type': 'application/json',
        },
        signal: tossSignal(),
    })

    if (!res.ok) {
        const error = await res.json()
        throw new Error(`빌링키 삭제 실패: ${error.message || JSON.stringify(error)}`)
    }

    return res.json()
}

/**
 * 주문 ID 생성 (고유값)
 */
export function generateOrderId(planType: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `curi-${planType}-${timestamp}-${random}`
}

/**
 * 일회성 결제 승인 (클로버 충전용)
 *
 * 토스 결제창에서 돌아온 paymentKey·orderId·amount 를 토스에 확인받는다.
 * ⚠️ 이 단계를 건너뛰고 화면이 주는 금액만 믿으면, 100원 내고 3만원어치를
 *    받았다고 우길 수 있다. 금액은 반드시 토스가 알려준 값으로 대조한다.
 */
export async function confirmPayment(paymentKey: string, orderId: string, amount: number) {
    const secretKey = process.env.TOSS_SECRET_KEY
    if (!secretKey) throw new Error('TOSS_SECRET_KEY 환경변수가 설정되지 않았습니다.')

    const res = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentKey, orderId, amount }),
        signal: tossSignal(),
    })

    const data = await res.json()
    if (!res.ok) {
        throw tossError(data?.message || '결제 승인에 실패했습니다.', data)
    }
    return data as {
        paymentKey: string
        orderId: string
        totalAmount: number
        status: string
        approvedAt: string
        receipt?: { url?: string }
    }
}

export interface TossPaymentView {
    paymentKey: string
    orderId: string
    status: string
    requestedAt: string
    approvedAt?: string | null
    totalAmount?: number
    method?: string | null
    orderName?: string | null
    receipt?: { url?: string } | null
    cancels?: { cancelAmount?: number; cancelReason?: string }[] | null
}

/**
 * 결제 한 건 조회. requestedAt = 토스가 적은 「결제창을 연 시각」(브라우저가 꾸밀 수 없다).
 * 클로버 판매가 끝난 뒤 들어온 주문인지 가를 때, 웹훅이 진짜 토스 결제인지 확인할 때 쓴다.
 */
export async function getPayment(paymentKey: string): Promise<TossPaymentView> {
    const res = await fetch(`${TOSS_API_BASE}/payments/${encodeURIComponent(paymentKey)}`, {
        headers: { Authorization: getAuthHeader() },
        signal: tossSignal(),
    })
    const data = await res.json()
    if (!res.ok) throw Object.assign(tossError(data?.message || '결제 조회에 실패했습니다.', data), { status: res.status })
    return data as TossPaymentView
}

/** 주문번호로 결제 조회. 없으면 null (토스 404). 같은 주문번호로 이미 결제됐는지 확인할 때 쓴다 */
export async function getPaymentByOrderId(orderId: string): Promise<TossPaymentView | null> {
    const res = await fetch(`${TOSS_API_BASE}/payments/orders/${encodeURIComponent(orderId)}`, {
        headers: { Authorization: getAuthHeader() },
        signal: tossSignal(),
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 404) return null
    if (!res.ok) throw tossError((data as { message?: string })?.message || '결제 조회에 실패했습니다.', data)
    return data as TossPaymentView
}

/**
 * 자동결제 갱신 주문번호 — 구독 번호 + 이번 기간 끝 날짜로 정해진다.
 * 같은 기간을 두 번 갱신하려 하면 같은 번호가 되고, 토스가 같은 주문번호 재결제를 거절한다 = 두 번 결제 원천 차단.
 */
export function renewOrderId(subscriptionId: string, periodEnd: string): string {
    const d = new Date(periodEnd)
    const day = Number.isNaN(d.getTime()) ? String(periodEnd).slice(0, 10) : d.toISOString().slice(0, 10)
    return `renew-${subscriptionId}-${day}`
}

/** 충전용 주문번호 — 어떤 상품을 샀는지 알아볼 수 있게 접두사를 붙인다 */
export function generateChargeOrderId(packId: string): string {
    return `clover_${packId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
