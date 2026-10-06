import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parsePdf, countPdfPages } from '../pdf'

const 샘플 = (이름: string) => readFileSync(path.resolve(__dirname, '../../../../../test/fixtures/pdf', 이름))
const 한글 = 'pair05-mods-해외통계채용.pdf'

describe('parsePdf 실제 한글 공문서(9쪽)', () => {
    it('한글이 깨지지 않고 충분히 나온다', async () => {
        const { text, pages } = await parsePdf(샘플(한글))
        const 한글수 = (text.match(/[가-힣]/g) ?? []).length
        expect(pages).toBe(9)
        expect(한글수).toBeGreaterThan(1500)
        // 깨짐 표시(대체문자·사설영역 글자)가 거의 없어야 한다
        const 깨짐 = (text.match(/[�-]/g) ?? []).length
        expect(깨짐 / text.length).toBeLessThan(0.005)
        expect(text).toContain('통계')
    })
    it('쪽 수만 센다', async () => {
        expect(await countPdfPages(샘플(한글))).toBe(9)
    })
    it('글자 없는 스캔본(빈 쪽)은 200자 미만으로 나온다 = 업스테이지 OCR 로 넘기는 기존 규칙이 그대로 걸린다', async () => {
        const 빈pdf = Buffer.from(
            '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
            '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF',
        )
        const { text, pages } = await parsePdf(빈pdf)
        expect(pages).toBe(1)
        expect(text.length).toBeLessThan(200)
    })
    it('깨진 파일은 던진다', async () => {
        await expect(parsePdf(Buffer.from('%PDF-1.4 garbage'))).rejects.toThrow()
    })
})
