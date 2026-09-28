import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BOT_HEX, botFill } from '../avatar'

// 로그인, 랜딩처럼 테마 밖에서 그린 캐릭터가 검정으로 칠해지던 문제(대표 0928 「큐리 검정색 아니야」)
describe('캐릭터 몸 색은 테마 밖에서도 제 색', () => {
    it('BOT_HEX 는 globals.css 의 --봇-* 값과 같다', () => {
        const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
        for (const [name, hex] of Object.entries(BOT_HEX)) {
            const m = css.match(new RegExp(`--봇-${name}\\s*:\\s*(#[0-9A-Fa-f]{6})`))
            expect(m, `--봇-${name} 이 globals.css 에 없다`).not.toBeNull()
            expect(m![1].toUpperCase()).toBe(hex.toUpperCase())
        }
    })

    it('몸 색 값은 변수가 없을 때 쓸 실제 색을 품는다 (큐리 초록 = #22C55E)', () => {
        expect(botFill('green')).toBe('var(--봇-green, #22C55E)')
    })
})
