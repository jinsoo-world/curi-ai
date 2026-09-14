import { describe, it, expect } from 'vitest'
import { CLOVER_PACKS, getPack, isValidPackId, CLOVER_UNIT_WON, type PackId } from '../packs'

/**
 * 클로버 충전 — 대표 확정 2026-09-14 「이거 충전식이면 좋을듯해. 클로버 충전 이런거.」
 * 값을 브라우저가 정하게 두면 100원 내고 10만 클로버를 받을 수 있다. 서버 표에서만 읽는다.
 */
describe('클로버 충전 상품', () => {
    it('상품을 모두 찾을 수 있고 값이 정해져 있다', () => {
        for (const p of CLOVER_PACKS) {
            expect(p.won).toBeGreaterThan(0)
            expect(p.clovers).toBeGreaterThan(0)
            expect(p.id).toBeTruthy()
        }
        expect(CLOVER_PACKS.length).toBeGreaterThanOrEqual(3)
    })

    it('많이 살수록 더 준다 (1클로버당 값이 싸진다)', () => {
        const 개당값 = CLOVER_PACKS.map(p => p.won / p.clovers)
        for (let i = 1; i < 개당값.length; i++) {
            expect(개당값[i], `${CLOVER_PACKS[i].id} 가 앞 상품보다 비싸다`).toBeLessThanOrEqual(개당값[i - 1])
        }
    })

    it('가장 작은 상품의 클로버 1개 값이 기준값과 같다', () => {
        const 첫상품 = CLOVER_PACKS[0]
        expect(첫상품.won / 첫상품.clovers).toBe(CLOVER_UNIT_WON)
    })

    it('원가보다 비싸게 판다 (대화 1번 원가 7.5원, 2027년 15.1원)', () => {
        // 클로버 1개 = 대화 1번. 단가가 2배가 되는 2027년에도 남아야 한다.
        expect(CLOVER_UNIT_WON).toBeGreaterThan(15.1)
    })

    it('없는 상품을 넣으면 아무것도 주지 않는다', () => {
        expect(getPack('없는것' as PackId)).toBeUndefined()
        expect(isValidPackId('없는것')).toBe(false)
        expect(isValidPackId('')).toBe(false)
        expect(isValidPackId(null)).toBe(false)
        expect(isValidPackId(9900)).toBe(false)
    })

    it('있는 상품은 전부 통과시킨다', () => {
        for (const p of CLOVER_PACKS) {
            expect(isValidPackId(p.id), `${p.id} 가 막혔다`).toBe(true)
            expect(getPack(p.id)!.won).toBe(p.won)
        }
    })
})
