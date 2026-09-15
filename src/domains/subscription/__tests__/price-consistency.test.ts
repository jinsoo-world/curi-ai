import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { PLANS } from '../types'

/**
 * 가격표가 여러 곳에 따로 적혀 있어서 화면은 9,900원, 실제 카드 청구는 7,900원이었다.
 * (2026-09-14 전수조사) 다시 갈라지면 이 시험이 먼저 잡는다.
 */
describe('가격은 한 곳에서만 나온다', () => {
    const 요금화면 = readFileSync(
        join(process.cwd(), 'src/app/pricing/page.tsx'),
        'utf-8',
    )

    it('요금 화면이 금액을 손으로 적어두지 않는다', () => {
        // 화면 파일 안에 price: 숫자 가 직접 박혀 있으면 안 된다
        const 손으로박은금액 = 요금화면.match(/price:\s*\d{4,}/g) || []
        expect(손으로박은금액).toEqual([])
    })

    it('요금 화면이 결제에 쓰는 가격표를 가져다 쓴다', () => {
        // 2026-09-15 = 요금 화면을 사진 기준으로 다시 썼다(구독은 새로 팔지 않는다).
        // 지금 화면이 보는 정본은 클로버 묶음표다. 취지(가격은 한 곳에서만)는 그대로다.
        expect(요금화면).toContain("from '@/domains/credit/packs'")
    })

    it('요금 화면이 클로버 묶음 값을 손으로 적어두지 않는다', () => {
        // 9,900 / 19,900 같은 숫자가 화면 파일에 직접 박혀 있으면 갈라진다
        const 박힌값 = 요금화면.match(/[^\w](9900|19900|29900)[^\w]/g) || []
        expect(박힌값).toEqual([])
    })

    it('결제 가격표가 비어 있지 않다', () => {
        expect(PLANS.monthly.price).toBeGreaterThan(0)
        expect(PLANS.annual.price).toBeGreaterThan(0)
    })
})
