import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    createSubscription,
    cancelSubscription,
    renewSubscription,
    expireSubscription,
    savePayment,
} from '../actions'

// ── Supabase Mock ──

function createMockDb(overrides: {
    insertReturn?: { data: unknown; error: unknown }
    updateReturn?: { data: unknown; error: unknown }
} = {}) {
    const insertReturn = overrides.insertReturn ?? { data: { id: 'sub-123' }, error: null }
    const updateReturn = overrides.updateReturn ?? { data: null, error: null }

    const mockChain = {
        from: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(insertReturn),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue(insertReturn),
    }

    // update chain resolves directly
    mockChain.update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue(updateReturn),
    })

    // insert chain
    mockChain.insert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(insertReturn),
        }),
    })

    mockChain.from = vi.fn().mockReturnValue(mockChain)

    return mockChain as unknown as Parameters<typeof createSubscription>[0]
}

// ── Tests ──

describe('subscription/actions', () => {
    describe('createSubscription', () => {
        it('월간 구독 생성 시 30일 후 만료', async () => {
            const db = createMockDb()
            const result = await createSubscription(db, {
                userId: 'user-1',
                planType: 'monthly',
                billingKey: 'bk-123',
                customerKey: 'ck-123',
            })

            expect(result).toEqual({ id: 'sub-123' })
        })

        it('DB 에러 시 throw', async () => {
            const db = createMockDb({
                insertReturn: { data: null, error: { message: 'DB 오류' } },
            })

            await expect(
                createSubscription(db, {
                    userId: 'user-1',
                    planType: 'monthly',
                    billingKey: 'bk-123',
                    customerKey: 'ck-123',
                })
            ).rejects.toThrow('DB 오류')
        })
    })

    describe('cancelSubscription', () => {
        it('취소 시 에러 없으면 성공', async () => {
            const updateEq = vi.fn().mockResolvedValue({ data: null, error: null })
            const db = {
                from: vi.fn().mockReturnValue({
                    update: vi.fn().mockReturnValue({ eq: updateEq }),
                }),
            } as unknown as Parameters<typeof cancelSubscription>[0]

            await cancelSubscription(db, 'sub-123')
            expect(updateEq).toHaveBeenCalledWith('id', 'sub-123')
        })

        it('DB 에러 시 throw', async () => {
            const db = {
                from: vi.fn().mockReturnValue({
                    update: vi.fn().mockReturnValue({
                        eq: vi.fn().mockResolvedValue({ error: { message: '취소 실패' } }),
                    }),
                }),
            } as unknown as Parameters<typeof cancelSubscription>[0]

            await expect(cancelSubscription(db, 'sub-123')).rejects.toThrow('취소 실패')
        })
    })

    describe('renewSubscription', () => {
        it('월간 갱신 성공', async () => {
            const eqFn = vi.fn().mockResolvedValue({ error: null })
            const db = {
                from: vi.fn().mockReturnValue({
                    update: vi.fn().mockReturnValue({ eq: eqFn }),
                }),
            } as unknown as Parameters<typeof renewSubscription>[0]

            await renewSubscription(db, 'sub-123', 'monthly')
            expect(eqFn).toHaveBeenCalledWith('id', 'sub-123')
        })

        it('연간 갱신 성공', async () => {
            const eqFn = vi.fn().mockResolvedValue({ error: null })
            const db = {
                from: vi.fn().mockReturnValue({
                    update: vi.fn().mockReturnValue({ eq: eqFn }),
                }),
            } as unknown as Parameters<typeof renewSubscription>[0]

            await renewSubscription(db, 'sub-123', 'annual')
            expect(eqFn).toHaveBeenCalledWith('id', 'sub-123')
        })
    })

    describe('expireSubscription', () => {
        it('만료 처리: 구독 expired + 유저 free 전환', async () => {
            const subEq = vi.fn().mockResolvedValue({ error: null })
            const userEq = vi.fn().mockResolvedValue({ error: null })

            let callCount = 0
            const db = {
                from: vi.fn().mockImplementation((table: string) => {
                    if (table === 'subscriptions') {
                        return { update: vi.fn().mockReturnValue({ eq: subEq }) }
                    }
                    if (table === 'users') {
                        return { update: vi.fn().mockReturnValue({ eq: userEq }) }
                    }
                }),
            } as unknown as Parameters<typeof expireSubscription>[0]

            await expireSubscription(db, 'sub-123', 'user-1')
            expect(subEq).toHaveBeenCalledWith('id', 'sub-123')
            expect(userEq).toHaveBeenCalledWith('id', 'user-1')
        })
    })

    describe('savePayment', () => {
        it('결제 내역 저장 성공', async () => {
            const db = {
                from: vi.fn().mockReturnValue({
                    insert: vi.fn().mockResolvedValue({ error: null }),
                }),
            } as unknown as Parameters<typeof savePayment>[0]

            await savePayment(db, {
                subscriptionId: 'sub-123',
                userId: 'user-1',
                tossPaymentKey: 'pk-123',
                tossOrderId: 'ord-123',
                amount: 9900,
                status: 'done',
            })
        })

        it('저장 실패 시 throw', async () => {
            const db = {
                from: vi.fn().mockReturnValue({
                    insert: vi.fn().mockResolvedValue({ error: { message: '저장 실패' } }),
                }),
            } as unknown as Parameters<typeof savePayment>[0]

            await expect(
                savePayment(db, {
                    subscriptionId: 'sub-123',
                    userId: 'user-1',
                    tossPaymentKey: 'pk-123',
                    tossOrderId: 'ord-123',
                    amount: 9900,
                    status: 'done',
                })
            ).rejects.toThrow('저장 실패')
        })
    })
})
