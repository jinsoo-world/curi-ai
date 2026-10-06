import { describe, it, expect } from 'vitest'
import { parsePdf, countPdfPages } from '../pdf'
import { 만든pdf, 로컬샘플, 로컬샘플있음 } from './helpers'

const 한글 = 'pair05-mods-해외통계채용.pdf'

describe('parsePdf — 코드로 만든 PDF', () => {
    it('글자와 쪽 수를 읽는다', async () => {
        const { text, pages } = await parsePdf(만든pdf('Hello Curi AI test'))
        expect(pages).toBe(1)
        expect(text).toContain('Hello Curi AI test')
        expect(await countPdfPages(만든pdf('x'))).toBe(1)
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

describe('parsePdf 실제 한글 공문서(9쪽) — 있을 때만', () => {
    it.skipIf(!로컬샘플있음('pdf', 한글))('한글이 깨지지 않고 충분히 나온다', async () => {
        const { text, pages } = await parsePdf(로컬샘플('pdf', 한글))
        expect(pages).toBe(9)
        expect((text.match(/[가-힣]/g) ?? []).length).toBeGreaterThan(1500)
        expect(((text.match(/[�-]/g) ?? []).length) / text.length).toBeLessThan(0.005)
    })
})
