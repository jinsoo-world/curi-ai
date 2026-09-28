/**
 * 파일 쪽 수 세기 (서버 전용, 로컬 처리, 돈 안 듦).
 * 월 자료 한도(page-limits.ts)와 업스테이지를 부르기 전 막기에 씁니다.
 * 세는 파일: PDF, 워드, 한글, 슬라이드, 엑셀. 글(txt, md), 자막(vtt)은 세지 않습니다.
 * 워드와 한글은 문서 정보의 쪽 수를 먼저 보고, 없으면 1,000자 = 1쪽으로 어림합니다 (설계 문서 7-7).
 */

export const COUNTED_EXTS = ['pdf', 'doc', 'docx', 'hwp', 'hwpx', 'ppt', 'pptx', 'xlsx', 'xls', 'csv'] as const

export function isCountedFile(ext: string): boolean {
    return (COUNTED_EXTS as readonly string[]).includes(ext.toLowerCase())
}

export const CHARS_PER_PAGE = 1000

export function pagesFromChars(chars: number): number {
    return Math.max(1, Math.ceil(Math.max(0, chars) / CHARS_PER_PAGE))
}

/** 글자 수도 모를 때 마지막 어림 (바이트 기준, 넉넉하게 적게 셉니다) */
export function pagesFromBytes(bytes: number, bytesPerPage = 30 * 1024): number {
    return Math.max(1, Math.ceil(Math.max(0, bytes) / bytesPerPage))
}

/**
 * OLE 문서 정보 묶음(SummaryInformation 류)에서 숫자 속성 하나를 읽습니다.
 * 한글(HwpSummaryInformation)과 옛 워드(SummaryInformation)의 쪽 수는 속성 14 입니다.
 */
export function readOlePropertyInt(stream: Uint8Array, propId: number): number | null {
    try {
        const b = Buffer.from(stream)
        if (b.length < 48) return null
        if (b.readUInt16LE(0) !== 0xfffe) return null
        const sets = b.readUInt32LE(24)
        if (sets < 1) return null
        const secOff = b.readUInt32LE(28 + 16)
        if (secOff + 8 > b.length) return null
        const count = b.readUInt32LE(secOff + 4)
        for (let i = 0; i < count && i < 256; i++) {
            const at = secOff + 8 + i * 8
            if (at + 8 > b.length) return null
            const id = b.readUInt32LE(at)
            if (id !== propId) continue
            const vOff = secOff + b.readUInt32LE(at + 4)
            if (vOff + 8 > b.length) return null
            const type = b.readUInt16LE(vOff)
            if (type === 3) return b.readInt32LE(vOff + 4)        // VT_I4
            if (type === 2) return b.readInt16LE(vOff + 4)        // VT_I2
            if (type === 19) return b.readUInt32LE(vOff + 4)      // VT_UI4
            return null
        }
        return null
    } catch {
        return null
    }
}

type CfbEntry = { content?: Uint8Array | number[] }
type CfbLib = {
    read: (data: Buffer, opts: { type: 'buffer' }) => { FullPaths: string[] }
    find: (cfb: unknown, path: string) => CfbEntry | null
}
type XlsxLib = {
    CFB: CfbLib
    read: (data: Buffer, opts: Record<string, unknown>) => { SheetNames: string[] }
}

async function loadXlsx(): Promise<XlsxLib> {
    const mod = await import('xlsx')
    return ((mod as unknown as { default?: XlsxLib }).default ?? (mod as unknown as XlsxLib))
}

function entryBytes(e: CfbEntry | null): Uint8Array | null {
    if (!e?.content) return null
    return e.content instanceof Uint8Array ? e.content : Uint8Array.from(e.content)
}

function entryText(e: CfbEntry | null): string {
    const b = entryBytes(e)
    return b ? Buffer.from(b).toString('utf8') : ''
}

function stripXml(s: string): string {
    return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export interface PageCount {
    pages: number
    /** 어떻게 셌나 (기록용) */
    method: string
}

/** 한글(HWP) 본문 글자 수 (hwpjs, 로컬). 못 읽으면 0 */
async function hwpLocalChars(buf: Buffer): Promise<number> {
    try {
        const { toMarkdown } = await import('@ohah/hwpjs')
        const r = toMarkdown(buf, { image: 'base64', useHtml: false })
        const md = typeof r === 'string' ? r : r.markdown || ''
        return md.replace(/data:[^)\s]+/g, '').trim().length
    } catch {
        return 0
    }
}

/**
 * 파일 쪽 수를 셉니다. 세지 않는 파일이면 null.
 * 절대 던지지 않습니다. 모르면 바이트로 어림합니다.
 */
export async function countFilePages(ext: string, buf: Buffer): Promise<PageCount | null> {
    const e = ext.toLowerCase()
    if (!isCountedFile(e)) return null
    try {
        if (e === 'csv') return { pages: 1, method: 'csv' }

        if (e === 'pdf') {
            const { PDFParse } = await import('pdf-parse')
            const parser = new PDFParse({ data: new Uint8Array(buf) })
            try {
                const info = await parser.getInfo()
                const total = Number((info as { total?: number }).total)
                if (Number.isFinite(total) && total > 0) return { pages: total, method: 'pdf' }
            } finally {
                await parser.destroy().catch(() => {})
            }
            return { pages: pagesFromBytes(buf.length, 100 * 1024), method: 'pdf-bytes' }
        }

        const X = await loadXlsx()

        if (e === 'xlsx' || e === 'xls') {
            const wb = X.read(buf, { type: 'buffer', bookSheets: true })
            return { pages: Math.max(1, wb.SheetNames.length), method: 'sheets' }
        }

        const cfb = X.CFB.read(buf, { type: 'buffer' })

        if (e === 'hwp') {
            const n = readOlePropertyInt(entryBytes(X.CFB.find(cfb, '\u0005HwpSummaryInformation')) ?? new Uint8Array(), 14)
            if (n && n > 0) return { pages: n, method: 'hwp-summary' }
            const chars = await hwpLocalChars(buf)
            if (chars > 0) return { pages: pagesFromChars(chars), method: 'hwp-chars' }
            return { pages: pagesFromBytes(buf.length), method: 'hwp-bytes' }
        }

        if (e === 'doc') {
            const n = readOlePropertyInt(entryBytes(X.CFB.find(cfb, '\u0005SummaryInformation')) ?? new Uint8Array(), 14)
            if (n && n > 0) return { pages: n, method: 'doc-summary' }
            return { pages: pagesFromBytes(buf.length), method: 'doc-bytes' }
        }

        if (e === 'ppt') {
            // 옛 슬라이드: 문서 정보 묶음 속성 7 = 슬라이드 수
            const n = readOlePropertyInt(entryBytes(X.CFB.find(cfb, '\u0005DocumentSummaryInformation')) ?? new Uint8Array(), 7)
            if (n && n > 0) return { pages: n, method: 'ppt-summary' }
            return { pages: pagesFromBytes(buf.length, 200 * 1024), method: 'ppt-bytes' }
        }

        const paths = cfb.FullPaths || []

        if (e === 'pptx') {
            const slides = paths.filter(p => /ppt\/slides\/slide\d+\.xml$/i.test(p)).length
            if (slides > 0) return { pages: slides, method: 'pptx-slides' }
            return { pages: pagesFromBytes(buf.length, 200 * 1024), method: 'pptx-bytes' }
        }

        if (e === 'docx') {
            const app = entryText(X.CFB.find(cfb, 'docProps/app.xml'))
            const m = app.match(/<Pages>(\d+)<\/Pages>/i)
            if (m && Number(m[1]) > 0) return { pages: Number(m[1]), method: 'docx-app' }
            const body = stripXml(entryText(X.CFB.find(cfb, 'word/document.xml')))
            if (body) return { pages: pagesFromChars(body.length), method: 'docx-chars' }
            return { pages: pagesFromBytes(buf.length), method: 'docx-bytes' }
        }

        if (e === 'hwpx') {
            let chars = 0
            for (const p of paths) {
                if (!/Contents\/section\d+\.xml$/i.test(p)) continue
                const rel = p.replace(/^Root Entry\//, '')
                chars += stripXml(entryText(X.CFB.find(cfb, rel))).length
            }
            if (chars > 0) return { pages: pagesFromChars(chars), method: 'hwpx-chars' }
            return { pages: pagesFromBytes(buf.length), method: 'hwpx-bytes' }
        }
    } catch (err) {
        console.warn('[doc-pages] 쪽 수 세기 실패, 바이트로 어림:', err instanceof Error ? err.message : err)
    }
    return { pages: pagesFromBytes(buf.length), method: 'bytes' }
}
