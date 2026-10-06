import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parsePptx } from '../pptx'

const 샘플 = (이름: string) => readFileSync(path.resolve(__dirname, '../../../../../test/fixtures/office', 이름))

describe('parsePptx (pptxtojson 2.2)', () => {
    it('영문 실파일: 슬라이드 제목과 글', async () => {
        const { text, slides } = await parsePptx(샘플('sample.pptx'))
        expect(slides).toBe(2)
        expect(text).toContain('[슬라이드 1]')
        expect(text).toContain('Lorem ipsum dolor sit amet')
        expect(text).not.toMatch(/<span|&nbsp;/)
    })
    it('한글 슬라이드', async () => {
        const { text } = await parsePptx(샘플('한글.pptx'))
        expect(text).toContain('큐리AI 파일 학습 시험 슬라이드')
    })
    it('표 칸 글에 HTML 태그가 안 남는다', async () => {
        const { text } = await parsePptx(샘플('한글표.pptx'))
        expect(text).toContain('표 첫 칸 가나다')
        expect(text).not.toMatch(/<p |<span|&nbsp;/)
    })
    it('깨진 파일은 던진다', async () => {
        await expect(parsePptx(Buffer.from('not a pptx'))).rejects.toThrow()
    })
})
