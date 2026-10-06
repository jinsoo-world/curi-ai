import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { parseExcel, csv글 } from '../excel'
import { parseWord } from '../word'
import { parsePptx } from '../pptx'
import { assertZipSafe, detectPasswordProtected, limitText, MAX_TEXT_CHARS, UnsafeFileError, asPasswordError, PasswordProtectedError } from '../safety'
import { parseHangul } from '../hwp'
import { 로컬샘플, 로컬샘플있음 } from './helpers'

describe('엑셀 범위 폭탄', () => {
    it('끝 칸 하나(XFD1048576)가 있어도 바로 끝난다', async () => {
        // 라이브러리로 쓰면 17조 칸을 도니 정상 파일을 만든 뒤 시트 XML 에 끝 칸을 직접 박는다
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['이름', '점수'], ['홍길동', 90]]), '폭탄')
        const z = await JSZip.loadAsync(Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })))
        let xml = await z.file('xl/worksheets/sheet1.xml')!.async('string')
        xml = xml.replace(/<dimension ref="[^"]*"\/>/, '<dimension ref="A1:XFD1048576"/>')
            .replace('</sheetData>', '<row r="1048576"><c r="XFD1048576" t="inlineStr"><is><t>끝칸</t></is></c></row></sheetData>')
        z.file('xl/worksheets/sheet1.xml', xml)
        const buf = Buffer.from(await z.generateAsync({ type: 'uint8array' }))
        const t = Date.now()
        const out = parseExcel(buf, 'xlsx')
        expect(Date.now() - t).toBeLessThan(5000)
        expect(out).toContain('홍길동,90')
        expect(out).toContain('[표가 너무 커서 앞부분만 읽었어요]')
    })
    it('5만 행을 넘으면 앞부분만 읽고 표시한다', () => {
        const rows = Array.from({ length: 50_010 }, (_, i) => [`행${i}`])
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '큰표')
        const out = parseExcel(Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })), 'xlsx')
        expect(out).toContain('행49999')
        expect(out).not.toContain('행50000\n')
        expect(out).toContain('[표가 너무 커서 앞부분만 읽었어요]')
    })
    it('작은 표에는 표시가 안 붙는다', () => {
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['가']]), 's')
        expect(parseExcel(Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })), 'xlsx')).not.toContain('너무 커서')
    })
})

describe('뽑은 글 상한', () => {
    it('50만 자를 넘으면 자르고 표시한다', () => {
        const r = limitText('가'.repeat(MAX_TEXT_CHARS + 10))
        expect(r.truncated).toBe(true)
        expect(r.text.startsWith('가'.repeat(MAX_TEXT_CHARS))).toBe(true)
        expect(r.text).toContain('앞부분 50만 자만 읽었어요')
        expect(limitText('짧은 글').truncated).toBe(false)
    })
})

describe('압축 폭탄', () => {
    async function 폭탄zip(바이트: number) {
        const z = new JSZip()
        z.file('a.xml', Buffer.alloc(바이트, 0x61))
        return Buffer.from(await z.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 9 } }))
    }
    it('압축률 100배 초과는 거절 (20MB 가 수십 KB)', async () => {
        const b = await 폭탄zip(20 * 1024 * 1024)
        expect(() => assertZipSafe(b)).toThrow(UnsafeFileError)
        expect(() => parseExcel(b, 'xlsx')).toThrow(UnsafeFileError)
        await expect(parseWord(b)).rejects.toThrow(UnsafeFileError)
        await expect(parsePptx(b)).rejects.toThrow(UnsafeFileError)
    })
    it('원래 크기 합계 200MB 초과는 거절', async () => {
        // 작은 zip 의 목차에 적힌 원래 크기를 210MB 로 고쳐 만든다
        const z = new JSZip()
        z.file('a.txt', 'x'.repeat(5000))
        const b = Buffer.from(await z.generateAsync({ type: 'uint8array', compression: 'STORE' }))
        b.writeUInt32LE(210 * 1024 * 1024, b.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 24)
        expect(() => assertZipSafe(b)).toThrow(/너무 큽니다/)
    })
    it('보통 파일은 통과', async () => {
        const z = new JSZip()
        z.file('a.txt', 'hello world '.repeat(10))
        const 보통 = Buffer.from(await z.generateAsync({ type: 'uint8array' }))
        expect(() => assertZipSafe(보통)).not.toThrow()
        expect(() => assertZipSafe(Buffer.from('plain text'))).not.toThrow()
    })
})

describe('CSV 글자 방식', () => {
    it('utf-16 LE(FF FE)', () => {
        expect(csv글(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('이름,나이\n가나다,3', 'utf16le')]))).toBe('이름,나이\n가나다,3')
    })
    it('utf-16 BE(FE FF)', () => {
        const le = Buffer.from('이름,나이\n가나다,3', 'utf16le')
        const be = Buffer.from(le); be.swap16()
        expect(csv글(Buffer.concat([Buffer.from([0xfe, 0xff]), be]))).toBe('이름,나이\n가나다,3')
    })
    it('utf-8', () => expect(csv글(Buffer.from('가나다,1', 'utf8'))).toBe('가나다,1'))
    it('EUC-KR 은 깨짐이 적은 쪽으로', () => {
        expect(csv글(Buffer.from([0xb0, 0xa1, 0xb3, 0xaa, 0xb4, 0xd9, 0x2c, 0x31]))).toBe('가나다,1')
    })
    it('utf-16 csv 가 엑셀 읽기를 끝까지 통과', () => {
        const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('이름,나이\n가나다,3', 'utf16le')])
        expect(parseExcel(buf, 'csv')).toContain('가나다,3')
    })
})

describe('암호 걸린 파일', () => {
    function cfb(파일: Record<string, Buffer>) {
        const c = XLSX.CFB.utils.cfb_new()
        for (const [이름, 내용] of Object.entries(파일)) XLSX.CFB.utils.cfb_add(c, `/${이름}`, 내용)
        return Buffer.from(XLSX.CFB.write(c, { type: 'buffer' }) as Uint8Array)
    }
    it('암호 건 docx/xlsx/pptx(EncryptedPackage 가 든 옛 컨테이너)', () => {
        const b = cfb({ EncryptionInfo: Buffer.from('x'), EncryptedPackage: Buffer.alloc(64) })
        expect(detectPasswordProtected('docx', b)).toBe(true)
        expect(detectPasswordProtected('xlsx', b)).toBe(true)
        expect(detectPasswordProtected('pptx', b)).toBe(true)
    })
    it('doc: 머리 표시 암호 비트', () => {
        const w = Buffer.alloc(0x200); w.writeUInt16LE(0x0100, 0x0a)
        expect(detectPasswordProtected('doc', cfb({ WordDocument: w }))).toBe(true)
        expect(detectPasswordProtected('doc', cfb({ WordDocument: Buffer.alloc(0x200) }))).toBe(false)
    })
    it('hwp 5.0: 파일 머리 암호 비트', () => {
        const h = Buffer.alloc(256); h.writeUInt32LE(0x3, 36)
        expect(detectPasswordProtected('hwp', cfb({ FileHeader: h }))).toBe(true)
        const n = Buffer.alloc(256); n.writeUInt32LE(0x1, 36)
        expect(detectPasswordProtected('hwp', cfb({ FileHeader: n }))).toBe(false)
    })
    it('오류 이름·코드·문구로 암호 오류를 가른다', () => {
        expect(asPasswordError({ name: 'PasswordException' })).toBeInstanceOf(PasswordProtectedError)
        expect(asPasswordError({ code: 'ENCRYPTED' })).toBeInstanceOf(PasswordProtectedError)
        expect(asPasswordError(new Error('File is password-protected'))).toBeInstanceOf(PasswordProtectedError)
        const 딴오류 = new Error('boom')
        expect(asPasswordError(딴오류)).toBe(딴오류)
    })
    it.skipIf(!로컬샘플있음('hangul', 'HWP5-password-123456.hwpx'))('암호 건 hwpx 실파일(kordoc 시험 자료)', async () => {
        await expect(parseHangul(로컬샘플('hangul', 'HWP5-password-123456.hwpx'))).rejects.toThrow(PasswordProtectedError)
    })
})
