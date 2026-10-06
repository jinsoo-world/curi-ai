import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { PROVIDERS, providerView } from '../providers'

describe('앱용 로고 PNG', () => {
    it('공급자 14개 모두 logoPng 가 있고 파일이 진짜 PNG 다', () => {
        for (const p of PROVIDERS) {
            const v = providerView(p, {})
            expect(v.logoPng).toMatch(/^\/logos\/[a-z_]+\.png$/)
            const f = path.join(process.cwd(), 'public', v.logoPng)
            expect(existsSync(f)).toBe(true)
            expect(readFileSync(f).subarray(1, 4).toString()).toBe('PNG')
        }
    })
})
