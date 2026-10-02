import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { metadata } from '@/app/charge/layout'

// 대표 결정 1002: 베이직 9,900원, 프로 39,000원. 옛 가격(29,000 / 99,000)이 손님 화면에 남으면 안 된다.
describe('요금제 화면 글자 (9,900원 / 39,000원)', () => {
    const files = [
        'src/app/charge/layout.tsx',
        'src/app/os/charge/page.tsx',
        'src/app/home/page.tsx',
        'src/app/landing/LandingBody.tsx',
        'src/app/pricing/page.tsx',
    ]

    it('검색·공유 설명글에 새 가격이 나온다', () => {
        expect(metadata.description).toContain('9,900원')
        expect(metadata.description).toContain('39,000원')
        expect(metadata.description).not.toMatch(/29,000|99,000/)
    })

    it('화면 파일에 옛 가격이 손으로 박혀 있지 않다', () => {
        for (const f of files) {
            const src = readFileSync(join(process.cwd(), f), 'utf-8')
            expect(src, f).not.toMatch(/29,000|99,000|29000|99000/)
        }
    })

    it('손님 설명글에 줄표·가운뎃점이 없다', () => {
        expect(String(metadata.description)).not.toMatch(/[—·]/)
    })

    it('/os/charge 는 결제 단추를 canBuyPlan 으로 정한다 (내리기 막기)', () => {
        const src = readFileSync(join(process.cwd(), 'src/app/os/charge/page.tsx'), 'utf-8')
        expect(src).toContain('canBuyPlan(')
    })
})
