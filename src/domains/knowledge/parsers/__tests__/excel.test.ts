import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseExcel } from '../excel'

function 만들기(bookType: XLSX.BookType) {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['이름', '점수'], ['홍길동', 90], ['김철수', 85]]), '성적')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['메모'], ['한글 메모입니다']]), '메모')
    return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType }))
}

describe('parseExcel', () => {
    for (const t of ['xlsx', 'biff8'] as const) {
        it(`${t}: 시트마다 제목을 달고 줄로 편다`, () => {
            const out = parseExcel(만들기(t))
            expect(out).toContain('[성적]\n이름,점수\n홍길동,90\n김철수,85')
            expect(out).toContain('[메모]\n메모\n한글 메모입니다')
        })
    }
    it('csv 한글', () => {
        const out = parseExcel(Buffer.from('이름,나이\n가나다,30\n', 'utf8'), 'csv')
        expect(out).toContain('가나다,30')
    })
    it('csv 한국 엑셀 기본 EUC-KR 도 깨지지 않는다', () => {
        const euckr = Buffer.from([0xb0, 0xa1, 0xb3, 0xaa, 0xb4, 0xd9, 0x2c, 0x31, 0x0a]) // 「가나다,1」
        expect(parseExcel(euckr, 'csv')).toContain('가나다,1')
    })
    it('빈 표는 빈 글', () => {
        expect(parseExcel(Buffer.from(''))).toBe('')
    })
})
