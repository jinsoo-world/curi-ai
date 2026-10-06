import { describe, it, expect } from 'vitest'
import { parseExcel } from '../excel'
import { 로컬샘플, 로컬샘플있음 } from './helpers'

describe('parseExcel 실제 파일 — 있을 때만', () => {
    it.skipIf(!로컬샘플있음('office', 'SimpleWithComments.xls'))('옛 xls 실파일(Excel 97, 주석 있는 표)', () => {
        const out = parseExcel(로컬샘플('office', 'SimpleWithComments.xls'), 'xls')
        expect(out.length).toBeGreaterThan(10)
        expect(out).toMatch(/^\[.+\]\n/)
    })
})
