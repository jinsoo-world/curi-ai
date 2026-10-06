import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { parseWord, parseDoc, parseDocx } from '../word'

const 샘플 = (이름: string) => readFileSync(path.resolve(__dirname, '../../../../../test/fixtures/office', 이름))

describe('parseWord', () => {
    it('옛 doc(워드 97) 한글을 읽는다', async () => {
        const out = await parseDoc(샘플('한글.doc'))
        expect(out).toContain('큐리AI 시험 문서입니다')
        expect(out).toContain('한글과 English 123')
    })
    it('docx 한글을 읽는다', async () => {
        const out = await parseDocx(샘플('한글.docx'))
        expect(out).toContain('큐리AI 시험 문서입니다')
    })
    it('앞머리로 가른다: doc, docx 둘 다 parseWord 하나로', async () => {
        expect(await parseWord(샘플('한글.doc'))).toContain('둘째 줄')
        expect(await parseWord(샘플('한글.docx'))).toContain('둘째 줄')
    })
    it('영문 옛 doc (각주 있는 실파일)', async () => {
        const out = await parseWord(샘플('footnote.doc'))
        expect(out.length).toBeGreaterThan(0)
    })
    it('깨진 파일은 던진다(호출쪽이 빈 글로 처리)', async () => {
        await expect(parseWord(Buffer.from('not a word file'))).rejects.toThrow()
    })
})
