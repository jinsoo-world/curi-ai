// 돈이 실제로 나가는 함수들에 대한 시험
// chargeBilling / issueBillingKey / deleteBillingKey 는 그동안 시험 밖에 있었다.
// 금액·주문번호가 그대로 전달되는지, 실패를 조용히 삼키지 않는지를 못 박는다.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { chargeBilling, issueBillingKey, deleteBillingKey } from '../toss'

const 원래키 = process.env.TOSS_SECRET_KEY

function 가짜응답(ok: boolean, body: unknown) {
    return { ok, json: async () => body } as unknown as Response
}

beforeEach(() => {
    process.env.TOSS_SECRET_KEY = 'test_sk_dummy'
})

afterEach(() => {
    if (원래키 === undefined) delete process.env.TOSS_SECRET_KEY
    else process.env.TOSS_SECRET_KEY = 원래키
    vi.restoreAllMocks()
})

describe('lib/toss — 자동결제 승인(chargeBilling)', () => {
    it('금액·주문번호·주문명을 바꾸지 않고 그대로 보낸다', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            가짜응답(true, { paymentKey: 'pk_1', orderId: 'curi-monthly-1-abc', totalAmount: 9900, status: 'DONE' }),
        )

        await chargeBilling('bk_1', 'cus_1', 9900, 'curi-monthly-1-abc', '큐리 AI 월간')

        expect(fetchSpy).toHaveBeenCalledTimes(1)
        const [url, init] = fetchSpy.mock.calls[0]
        expect(String(url)).toBe('https://api.tosspayments.com/v1/billing/bk_1')
        expect((init as RequestInit).method).toBe('POST')
        const 보낸값 = JSON.parse(String((init as RequestInit).body))
        expect(보낸값).toEqual({
            customerKey: 'cus_1',
            amount: 9900,
            orderId: 'curi-monthly-1-abc',
            orderName: '큐리 AI 월간',
        })
    })

    it('시크릿 키를 Basic 인증으로 싣는다 (평문으로 보내지 않는다)', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(가짜응답(true, {}))
        await chargeBilling('bk_1', 'cus_1', 1000, 'o1', '주문')
        const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>
        expect(headers.Authorization).toBe(`Basic ${Buffer.from('test_sk_dummy:').toString('base64')}`)
        expect(headers.Authorization).not.toContain('test_sk_dummy')
    })

    it('토스가 실패를 주면 예외로 올린다 (조용히 성공 처리하지 않는다)', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            가짜응답(false, { code: 'REJECT_CARD_COMPANY', message: '카드사 승인 거절' }),
        )
        await expect(chargeBilling('bk_1', 'cus_1', 9900, 'o1', '주문')).rejects.toThrow('카드사 승인 거절')
    })

    it('실패 응답에 message 가 없어도 삼키지 않는다', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(가짜응답(false, { code: 'UNKNOWN' }))
        await expect(chargeBilling('bk_1', 'cus_1', 9900, 'o1', '주문')).rejects.toThrow('결제 승인 실패')
    })

    it('시크릿 키가 없으면 결제를 시도하지 않는다', async () => {
        delete process.env.TOSS_SECRET_KEY
        const fetchSpy = vi.spyOn(globalThis, 'fetch')
        await expect(chargeBilling('bk_1', 'cus_1', 9900, 'o1', '주문')).rejects.toThrow('TOSS_SECRET_KEY')
        expect(fetchSpy).not.toHaveBeenCalled()
    })
})

describe('lib/toss — 빌링키 발급(issueBillingKey)', () => {
    it('authKey·customerKey 를 그대로 보낸다', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
            가짜응답(true, { billingKey: 'bk_new', customerKey: 'cus_1' }),
        )
        const 결과 = await issueBillingKey('auth_1', 'cus_1')
        expect(String(fetchSpy.mock.calls[0][0])).toBe('https://api.tosspayments.com/v1/billing/authorizations/issue')
        expect(JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body))).toEqual({
            authKey: 'auth_1',
            customerKey: 'cus_1',
        })
        expect(결과.billingKey).toBe('bk_new')
    })

    it('발급 실패를 예외로 올린다', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(가짜응답(false, { message: '인증키 만료' }))
        await expect(issueBillingKey('auth_1', 'cus_1')).rejects.toThrow('인증키 만료')
    })
})

describe('lib/toss — 빌링키 삭제(deleteBillingKey)', () => {
    it('DELETE 로 해당 빌링키만 지운다', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(가짜응답(true, {}))
        await deleteBillingKey('bk_1')
        expect(String(fetchSpy.mock.calls[0][0])).toBe('https://api.tosspayments.com/v1/billing/bk_1')
        expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
    })

    it('삭제 실패를 예외로 올린다', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(가짜응답(false, { message: '없는 빌링키' }))
        await expect(deleteBillingKey('bk_1')).rejects.toThrow('없는 빌링키')
    })
})
