import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parseExcel } from '../excel'

describe('parseExcel 실제 파일', () => {
    it('옛 xls 실파일(Excel 97, 주석 있는 표)', () => {
        const out = parseExcel(readFileSync(path.resolve(__dirname, '../../../../../test/fixtures/office/SimpleWithComments.xls')), 'xls')
        expect(out.length).toBeGreaterThan(10)
        expect(out).toMatch(/^\[.+\]\n/)
    })
})
