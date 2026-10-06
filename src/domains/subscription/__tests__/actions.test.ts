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

    // cancelSubscription · renewSubscription 은 renew-cancel-race.test.ts 에서 본다(상태 조건이 생겨 모양이 바뀜)

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
        const input = { subscriptionId: 'sub-123', userId: 'user-1', tossPaymentKey: 'pk-123', tossOrderId: 'ord-123', amount: 9900, status: 'done' as const }

        it('같은 주문번호는 한 번만 = upsert(toss_order_id, ignoreDuplicates)', async () => {
            const upsert = vi.fn().mockResolvedValue({ error: null })
            const db = { from: vi.fn().mockReturnValue({ upsert }) } as unknown as Parameters<typeof savePayment>[0]
            await savePayment(db, input)
            expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ toss_order_id: 'ord-123', amount: 9900 }), { onConflict: 'toss_order_id', ignoreDuplicates: true })
        })

        it('고유 색인이 아직 없으면(42P10, 마이그레이션 전) 예전처럼 insert', async () => {
            const upsert = vi.fn().mockResolvedValue({ error: { code: '42P10', message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' } })
            const insert = vi.fn().mockResolvedValue({ error: null })
            const db = { from: vi.fn().mockReturnValue({ upsert, insert }) } as unknown as Parameters<typeof savePayment>[0]
            await savePayment(db, input)
            expect(insert).toHaveBeenCalledTimes(1)
        })

        it('저장 실패 시 throw', async () => {
            const db = {
                from: vi.fn().mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: { message: '저장 실패' } }) }),
            } as unknown as Parameters<typeof savePayment>[0]
            await expect(savePayment(db, input)).rejects.toThrow('저장 실패')
        })
    })
})
