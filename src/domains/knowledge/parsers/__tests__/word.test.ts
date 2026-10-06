import { describe, it, expect } from 'vitest'
import { parseWord, parseDoc, parseDocx } from '../word'
import { 만든docx, 로컬샘플, 로컬샘플있음 } from './helpers'

describe('parseWord — 코드로 만든 docx', () => {
    it('docx 한글을 읽는다', async () => {
        const out = await parseDocx(await 만든docx(['안녕하세요. 큐리AI 시험 문서입니다.', '둘째 줄: 한글과 English 123.']))
        expect(out).toContain('큐리AI 시험 문서입니다')
        expect(out).toContain('한글과 English 123')
    })
    it('앞머리(PK)로 docx 를 가른다', async () => {
        expect(await parseWord(await 만든docx(['가나다']))).toContain('가나다')
    })
    it('깨진 파일은 던진다(호출쪽이 빈 글로 처리)', async () => {
        await expect(parseWord(Buffer.from('not a word file'))).rejects.toThrow()
    })
})

describe('parseDoc 옛 워드 — 실제 파일이 있을 때만', () => {
    it.skipIf(!로컬샘플있음('office', '한글.doc'))('옛 doc(워드 97) 한글을 읽는다', async () => {
        const buf = 로컬샘플('office', '한글.doc')
        expect(await parseDoc(buf)).toContain('큐리AI 시험 문서입니다')
        expect(await parseWord(buf)).toContain('둘째 줄')
    })
    it.skipIf(!로컬샘플있음('office', 'footnote.doc'))('영문 옛 doc(각주 있는 실파일)', async () => {
        expect((await parseWord(로컬샘플('office', 'footnote.doc'))).length).toBeGreaterThan(0)
    })
})
