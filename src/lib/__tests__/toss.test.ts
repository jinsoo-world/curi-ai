import { describe, it, expect, vi } from 'vitest'
import { generateOrderId } from '../toss'

describe('lib/toss', () => {
    describe('generateOrderId', () => {
        it('curi-{plan}-{timestamp}-{random} 형식', () => {
            const orderId = generateOrderId('monthly')
            expect(orderId).toMatch(/^curi-monthly-\d+-[a-z0-9]{6}$/)
        })

        it('annual 플랜', () => {
            const orderId = generateOrderId('annual')
            expect(orderId).toMatch(/^curi-annual-\d+-[a-z0-9]{6}$/)
        })

        it('매번 다른 ID 생성', () => {
            const id1 = generateOrderId('monthly')
            const id2 = generateOrderId('monthly')
            expect(id1).not.toBe(id2)
        })
    })

    describe('getAuthHeader (환경변수)', () => {
        it('TOSS_SECRET_KEY 미설정 시 에러', async () => {
            // getAuthHeader는 내부 함수이므로,
            // issueBillingKey를 호출하면 간접적으로 테스트 가능
            // 다만 fetch를 mock해야 하므로 여기서는 환경변수 체크만
            const original = process.env.TOSS_SECRET_KEY
            delete process.env.TOSS_SECRET_KEY

            // issueBillingKey를 dynamic import하면 getAuthHeader가 호출됨
            try {
                const { issueBillingKey } = await import('../toss')
                await expect(issueBillingKey('auth-key', 'customer-key')).rejects.toThrow(
                    'TOSS_SECRET_KEY'
                )
            } finally {
                if (original) process.env.TOSS_SECRET_KEY = original
            }
        })
    })
})
