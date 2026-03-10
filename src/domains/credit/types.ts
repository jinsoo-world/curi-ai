/**
 * 크레딧 도메인 타입 정의
 * 큐리 AI — 크레딧 충전/차감/잔액 관리
 */

/** 크레딧 트랜잭션 유형 */
export type CreditTransactionType =
    | 'signup_bonus'    // 가입 보너스
    | 'purchase'        // 충전 구매
    | 'chat_usage'      // 대화 사용 차감
    | 'refund'          // 환불
    | 'admin_grant'     // 관리자 수동 지급
    | 'promo'           // 프로모션 지급

/** 크레딧 트랜잭션 레코드 */
export interface CreditTransaction {
    id: string
    user_id: string
    amount: number              // 양수=충전, 음수=차감
    balance_after: number       // 트랜잭션 후 잔액
    type: CreditTransactionType
    description: string | null
    mentor_id: string | null    // 대화 차감 시 어떤 멘토와 대화했는지
    created_at: string
}

/** 유저 크레딧 잔액 (users 테이블 확장) */
export interface UserCreditBalance {
    user_id: string
    credit_balance: number
}

/** 크레딧 충전 요청 */
export interface CreditChargeRequest {
    user_id: string
    amount: number
    type: CreditTransactionType
    description?: string
    mentor_id?: string
}

/** 크레딧 차감 요청 */
export interface CreditDeductRequest {
    user_id: string
    amount: number              // 양수로 입력 (내부에서 음수 처리)
    mentor_id: string
    description?: string
}

/** 크레딧 상수 */
export const CREDIT_CONSTANTS = {
    SIGNUP_BONUS: 10000,            // 가입 보너스 크레딧
    CHAT_COST_PER_MESSAGE: 500,     // 메시지당 차감 크레딧
    MIN_CHARGE_AMOUNT: 1000,        // 최소 충전 금액
} as const
