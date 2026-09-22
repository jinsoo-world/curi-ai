import { describe, it, expect } from 'vitest'
import { CLOVER_PACKS } from '../packs'
import {
    packRows, isLowClover, resolveReturnPath, makeChargeOrderId, chargeReturnUrls,
    LOW_CLOVER_LINE, DEFAULT_RETURN_PATH,
} from '../charge-flow'

/**
 * 봇 팀 충전 화면(/os/charge)이 쓰는 셈 함수들.
 * 화면은 이 표만 그린다 — 여기서 틀리면 옛 /charge 와 새 화면이 같이 틀린다.
 */
describe('충전 상품 표 (packRows)', () => {
    it('상품 표와 줄 수·값이 하나도 어긋나지 않는다', () => {
        const rows = packRows()
        expect(rows.length).toBe(CLOVER_PACKS.length)
        rows.forEach((r, i) => {
            expect(r.id).toBe(CLOVER_PACKS[i].id)
            expect(r.clovers).toBe(CLOVER_PACKS[i].clovers)
            expect(r.won).toBe(CLOVER_PACKS[i].won)
        })
    })

    it('할인은 작은 묶음 0%, 큰 묶음일수록 크고, 추천은 딱 하나(가장 큰 할인)', () => {
        const rows = packRows()
        expect(rows[0].discount).toBe(0)
        for (let i = 1; i < rows.length; i++) expect(rows[i].discount).toBeGreaterThan(rows[i - 1].discount)
        const 추천 = rows.filter(r => r.recommended)
        expect(추천.length).toBe(1)
        expect(추천[0].discount).toBe(Math.max(...rows.map(r => r.discount)))
    })

    it('상품 줄에 원화 환산(1개 몇 원) 칸이 없다 (대표 확정 0915)', () => {
        for (const r of packRows()) {
            expect(Object.keys(r).sort()).toEqual(['clovers', 'discount', 'id', 'recommended', 'won'])
        }
    })
})

describe('잔량 경고선 (isLowClover)', () => {
    it('경고선은 20개고, 20개 이하면 경고한다', () => {
        expect(LOW_CLOVER_LINE).toBe(20)
        expect(isLowClover(0)).toBe(true)
        expect(isLowClover(20)).toBe(true)
        expect(isLowClover(21)).toBe(false)
        expect(isLowClover(1000)).toBe(false)
    })

    it('잔량을 아직 못 읽었으면(null·undefined·NaN) 경고하지 않는다', () => {
        expect(isLowClover(null)).toBe(false)
        expect(isLowClover(undefined)).toBe(false)
        expect(isLowClover(Number.NaN)).toBe(false)
    })

    it('경고선을 바꿔 부를 수 있다', () => {
        expect(isLowClover(50, 100)).toBe(true)
        expect(isLowClover(150, 100)).toBe(false)
    })
})

describe('돌아갈 주소 (resolveReturnPath)', () => {
    it('우리 사이트 안의 경로는 그대로 돌려준다', () => {
        expect(resolveReturnPath('/os/chat/abc')).toBe('/os/chat/abc')
        expect(resolveReturnPath('/os')).toBe('/os')
        expect(resolveReturnPath('/os/chat/abc?demo=1')).toBe('/os/chat/abc?demo=1')
    })

    it('다른 사이트로 튕기는 값은 전부 기본 주소(/os)로 바꾼다', () => {
        expect(DEFAULT_RETURN_PATH).toBe('/os')
        for (const 나쁜값 of ['https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', 'os/chat', '', null, undefined, '/os\n//evil.com']) {
            expect(resolveReturnPath(나쁜값), `${나쁜값} 를 통과시켰다`).toBe('/os')
        }
    })

    it('기본 주소를 바꿔 부를 수 있다', () => {
        expect(resolveReturnPath(null, '/mentors')).toBe('/mentors')
        expect(resolveReturnPath('//evil.com', '/mentors')).toBe('/mentors')
    })
})

describe('주문번호·돌아올 주소', () => {
    it('주문번호는 clover_{상품}_{시각}_{난수} 모양이고 매번 다르다', () => {
        expect(makeChargeOrderId('p50', 1700000000000, 'abc123')).toBe('clover_p50_1700000000000_abc123')
        expect(makeChargeOrderId('p50')).toMatch(/^clover_p50_\d+_[a-z0-9]{1,8}$/)
        expect(makeChargeOrderId('p50')).not.toBe(makeChargeOrderId('p50'))
    })

    it('토스가 돌려보낼 주소 두 개 = 성공은 done 에 상품 id, 실패는 failed=1', () => {
        const u = chargeReturnUrls('https://www.curi-ai.com', '/os/charge/done', '/os/charge', 'p50')
        expect(u.successUrl).toBe('https://www.curi-ai.com/os/charge/done?packId=p50')
        expect(u.failUrl).toBe('https://www.curi-ai.com/os/charge?failed=1')
    })
})
