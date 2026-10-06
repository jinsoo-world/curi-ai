import { describe, it, expect } from 'vitest'
import { parsePptx } from '../pptx'
import { 만든pptx, 로컬샘플, 로컬샘플있음 } from './helpers'

describe('parsePptx (pptxtojson 2.2) — 코드로 만든 파일', () => {
    it('슬라이드마다 제목을 달고 한글 글을 읽는다', async () => {
        const { text, slides } = await parsePptx(await 만든pptx([{ 글: '큐리AI 파일 학습 시험' }, { 글: '둘째 슬라이드 English 123' }]))
        expect(slides).toBe(2)
        expect(text).toContain('[슬라이드 1]\n큐리AI 파일 학습 시험')
        expect(text).toContain('[슬라이드 2]')
        expect(text).not.toMatch(/<span|&nbsp;/)
    })
    it('표 칸 글에 HTML 태그가 안 남는다', async () => {
        const { text } = await parsePptx(await 만든pptx([{ 글: '제목', 표칸: '표 첫 칸 가나다' }]))
        expect(text).toContain('표 첫 칸 가나다')
        expect(text).not.toMatch(/<p |<span|&nbsp;/)
    })
    it('깨진 파일은 던진다', async () => {
        await expect(parsePptx(Buffer.from('not a pptx'))).rejects.toThrow()
    })
    it.skipIf(!로컬샘플있음('office', 'sample.pptx'))('실제 파일(영문 2쪽)', async () => {
        const { text, slides } = await parsePptx(로컬샘플('office', 'sample.pptx'))
        expect(slides).toBe(2)
        expect(text).toContain('Lorem ipsum dolor sit amet')
    })
})
