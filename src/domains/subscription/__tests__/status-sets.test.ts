// 새 구독 상태(renewing·renew_paid_unsynced·past_due) 때문에 이중 결제·이용권 끊김이 생기지 않게
import { describe, it, expect } from 'vitest'
import { BILLING_LIVE_STATUSES, ENTITLED_STATUSES } from '../types'
import { getActiveSubscription } from '../queries'

describe('구독 상태 묶음', () => {
    it('결제가 살아 있는 상태 = 새 구독·탈퇴를 막는다 (갱신 중·결제됨 미반영·연체 포함)', () => {
        expect([...BILLING_LIVE_STATUSES].sort()).toEqual(['active', 'past_due', 'renew_paid_unsynced', 'renewing'])
    })
    it('이용권이 있는 상태 = 해지 예약(canceled)·갱신 중·결제됨 미반영 포함, 연체는 제외', () => {
        expect([...ENTITLED_STATUSES].sort()).toEqual(['active', 'canceled', 'renew_paid_unsynced', 'renewing'])
    })
    it('이용권 조회가 그 묶음을 쓴다(갱신 도중에도 이용권이 끊기지 않는다)', async () => {
        let inArgs: unknown[] = []
        const q: Record<string, unknown> = {}
        for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q
        q.in = (...a: unknown[]) => { inArgs = a; return q }
        q.maybeSingle = async () => ({ data: null, error: null })
        await getActiveSubscription({ from: () => q } as never, 'u1')
        expect(inArgs).toEqual(['status', [...ENTITLED_STATUSES]])
    })
})
