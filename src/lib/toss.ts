// 큐리 AI — 토스페이먼츠 서버 유틸리티
// 시크릿 키는 서버에서만 사용 (API Routes)

const TOSS_API_BASE = 'https://api.tosspayments.com/v1'

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
    })

    if (!res.ok) {
        const error = await res.json()
        throw new Error(`결제 승인 실패: ${error.message || JSON.stringify(error)}`)
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
