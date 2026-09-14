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
        expect(요금화면).toContain("from '@/domains/subscription'")
    })

    it('결제 가격표가 비어 있지 않다', () => {
        expect(PLANS.monthly.price).toBeGreaterThan(0)
        expect(PLANS.annual.price).toBeGreaterThan(0)
    })
})
