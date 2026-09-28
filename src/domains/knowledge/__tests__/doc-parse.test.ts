import { describe, it, expect } from 'vitest'
import {
    decidePageGate, blockBeforeUpload, upstageDocCostKrw, DOC_PARSE_KRW_PER_PAGE, UPSTAGE_MONTHLY_CAP_KRW,
    kstMonthStart, docParseEnabled, docParseText, docSpaceView, DOC_PARSE,
} from '../doc-parse'
import { readOlePropertyInt, countFilePages, isCountedFile, pagesFromChars } from '../doc-pages'
import { MONTHLY_FILE_PAGES, MAX_PAGES_PER_FILE, pageUsagePercent } from '../page-limits'

describe('대표 확정값', () => {
    it('월 쪽 한도 10, 100, 300 과 파일 하나 최대 30, 100', () => {
        expect(MONTHLY_FILE_PAGES).toEqual({ free: 10, basic: 100, pro: 300 })
        expect(MAX_PAGES_PER_FILE).toEqual({ free: 30, basic: 100, pro: 100 })
    })
    it('Standard 만, 쪽당 13.56원, 월 상한 50달러 = 67,800원', () => {
        expect(DOC_PARSE.model).toBe('document-parse')
        expect(DOC_PARSE.mode).toBe('standard')
        expect(DOC_PARSE_KRW_PER_PAGE).toBe(13.56)
        expect(UPSTAGE_MONTHLY_CAP_KRW).toBe(67800)
    })
    it('원화 기록: document-parse 2쪽 27.12원, ocr 1쪽 2.03원, 모르는 모델은 비움', () => {
        expect(upstageDocCostKrw('document-parse', 2)).toBe(27.12)
        expect(upstageDocCostKrw('ocr', 1)).toBe(2.03)
        expect(upstageDocCostKrw('other', 1)).toBeNull()
        expect(upstageDocCostKrw('document-parse', null)).toBeNull()
    })
})

describe('decidePageGate', () => {
    it('포함분 안이면 통과, 클로버 0', () => {
        expect(decidePageGate({ plan: 'free', usedPages: 4, filePages: 6, payClovers: false })).toEqual({ ok: true, overPages: 0, clovers: 0 })
    })
    it('무료가 넘으면 요금제 안내만 (클로버 없음)', () => {
        expect(decidePageGate({ plan: 'free', usedPages: 8, filePages: 3, payClovers: true })).toEqual({ ok: false, code: 'doc_space_full', canPayClovers: false })
    })
    it('유료가 넘으면 묻고, 클로버를 고르면 넘은 쪽 x 6', () => {
        expect(decidePageGate({ plan: 'basic', usedPages: 98, filePages: 5, payClovers: false })).toEqual({ ok: false, code: 'doc_space_full', canPayClovers: true })
        expect(decidePageGate({ plan: 'basic', usedPages: 98, filePages: 5, payClovers: true })).toEqual({ ok: true, overPages: 3, clovers: 18 })
    })
    it('파일 하나 최대 쪽을 넘으면 막음', () => {
        expect(decidePageGate({ plan: 'free', usedPages: 0, filePages: 31, payClovers: false }).ok).toBe(false)
        expect(decidePageGate({ plan: 'pro', usedPages: 0, filePages: 101, payClovers: true })).toMatchObject({ ok: false, code: 'file_too_long' })
    })
})

describe('blockBeforeUpload', () => {
    it('100% 전이면 통과', () => {
        expect(blockBeforeUpload({ plan: 'free', usedPages: 9, payClovers: false })).toBeNull()
    })
    it('100% 면 무료는 막고, 유료는 클로버를 고르면 통과', () => {
        expect(blockBeforeUpload({ plan: 'free', usedPages: 10, payClovers: true })).toMatchObject({ ok: false, canPayClovers: false })
        expect(blockBeforeUpload({ plan: 'pro', usedPages: 300, payClovers: false })).toMatchObject({ ok: false, canPayClovers: true })
        expect(blockBeforeUpload({ plan: 'pro', usedPages: 300, payClovers: true })).toBeNull()
    })
})

describe('화면은 퍼센트만', () => {
    it('64% 와 80% 알림', () => {
        expect(pageUsagePercent(64, 'basic')).toBe(64)
        const v = docSpaceView('free', 8)
        expect(v).toEqual({ enabled: true, percent: 80, warn: true, full: false, canPayClovers: false })
        expect(JSON.stringify(v)).not.toMatch(/pages|used|limit/)
    })
})

describe('기타', () => {
    it('서울 이번 달 1일 0시', () => {
        expect(kstMonthStart(new Date('2026-09-30T16:00:00Z')).toISOString()).toBe('2026-09-30T15:00:00.000Z')
        expect(kstMonthStart(new Date('2026-09-29T01:00:00Z')).toISOString()).toBe('2026-08-31T15:00:00.000Z')
    })
    it('스위치', () => {
        expect(docParseEnabled({})).toBe(false)
        expect(docParseEnabled({ DOC_PARSE_ENABLED: '1' })).toBe(true)
        expect(docParseEnabled({ DOC_PARSE_ENABLED: 'true' })).toBe(true)
        expect(docParseEnabled({ DOC_PARSE_ENABLED: '0' })).toBe(false)
    })
    it('응답 글은 마크다운 먼저', () => {
        expect(docParseText({ content: { markdown: '# 제목\n본문', html: '<p>x</p>' } })).toBe('# 제목\n본문')
        expect(docParseText({ content: { html: '<p>가</p><p>나</p>' } })).toContain('가')
    })
    it('세는 파일만 셈', () => {
        expect(isCountedFile('hwp')).toBe(true)
        expect(isCountedFile('txt')).toBe(false)
        expect(pagesFromChars(2032)).toBe(3)
        expect(pagesFromChars(0)).toBe(1)
    })
})

describe('쪽 수 세기', () => {
    it('OLE 문서 정보에서 속성 14(쪽 수)를 읽음', () => {
        const b = Buffer.alloc(48 + 40)
        b.writeUInt16LE(0xfffe, 0)
        b.writeUInt32LE(1, 24)
        const sec = 48
        b.writeUInt32LE(sec, 28 + 16)
        b.writeUInt32LE(8 + 16 + 8, sec)
        b.writeUInt32LE(2, sec + 4)
        b.writeUInt32LE(2, sec + 8); b.writeUInt32LE(24, sec + 12)
        b.writeUInt32LE(14, sec + 16); b.writeUInt32LE(32, sec + 20)
        b.writeUInt16LE(3, sec + 24); b.writeInt32LE(99, sec + 28)
        b.writeUInt16LE(3, sec + 32); b.writeInt32LE(6, sec + 36)
        expect(readOlePropertyInt(b, 14)).toBe(6)
        expect(readOlePropertyInt(b, 2)).toBe(99)
        expect(readOlePropertyInt(b, 7)).toBeNull()
        expect(readOlePropertyInt(Buffer.alloc(10), 14)).toBeNull()
    })
    it('엑셀은 시트 수, CSV 는 1쪽, 글은 세지 않음', async () => {
        const XLSX = await import('xlsx')
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a']]), 'A')
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['b']]), 'B')
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
        expect(await countFilePages('xlsx', buf)).toEqual({ pages: 2, method: 'sheets' })
        expect(await countFilePages('csv', Buffer.from('a,b'))).toEqual({ pages: 1, method: 'csv' })
        expect(await countFilePages('txt', Buffer.from('hello'))).toBeNull()
    })
    it('못 읽는 파일은 던지지 않고 바이트로 어림', async () => {
        const r = await countFilePages('docx', Buffer.from('not a zip'))
        expect(r?.pages).toBeGreaterThanOrEqual(1)
    })
})
