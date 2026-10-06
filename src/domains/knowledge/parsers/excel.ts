// 엑셀·CSV 읽기. SheetJS 0.20.3 (npm 이 아닌 공식 서버판, 취약점 수리판)
// 표는 시트마다 제목을 달고 줄로 편다. AI 가 읽을 때 어느 표의 어느 칸인지 알아야 한다.
import * as XLSX from 'xlsx'
import { assertZipSafe, asPasswordError, limitText, MAX_TEXT_CHARS } from './safety'

export const MAX_ROWS = 50_000
export const MAX_COLS = 200
const 표큼 = '[표가 너무 커서 앞부분만 읽었어요]'

function 깨짐수(s: string): number {
    return (s.match(/\uFFFD/g) ?? []).length
}

/**
 * CSV 는 바이트로 넘기면 SheetJS 가 한글을 깨뜨린다(1252 로 읽음). 직접 푼다.
 * 앞머리 FF FE / FE FF = utf-16. 그 밖에는 utf-8 과 EUC-KR(CP949, 한국 엑셀 기본) 둘 다 읽어 깨짐(U+FFFD)이 적은 쪽.
 */
export function csv글(buffer: Buffer): string {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return new TextDecoder('utf-16le').decode(buffer.subarray(2))
    if (buffer[0] === 0xfe && buffer[1] === 0xff) return new TextDecoder('utf-16be').decode(buffer.subarray(2))
    const u8 = new TextDecoder('utf-8').decode(buffer)
    if (깨짐수(u8) === 0) return u8
    const kr = new TextDecoder('euc-kr').decode(buffer)
    return 깨짐수(kr) < 깨짐수(u8) ? kr : u8
}

/**
 * 실제로 칸이 있는 범위만 본다. 선언된 범위(!ref)는 믿지 않는다:
 * 끝 칸 하나(XFD1048576)만 찍어도 sheet_to_csv 가 170억 칸을 돈다.
 */
function 쓴범위(시트: XLSX.WorkSheet): { 범위: XLSX.Range; 크다: boolean } | null {
    const s = { r: Infinity, c: Infinity }
    const e = { r: -1, c: -1 }
    const 창 = { r: -1, c: -1 } // 5만 행 x 200 열 안에 있는 칸들의 끝
    let 칸있음 = false
    const 칸들: Array<{ r: number; c: number }> = []
    for (const 키 of Object.keys(시트)) {
        if (키.charCodeAt(0) === 33) continue // '!ref' 같은 메타
        칸있음 = true
        const { r, c } = XLSX.utils.decode_cell(키)
        칸들.push({ r, c })
        if (r < s.r) s.r = r
        if (c < s.c) s.c = c
        if (r > e.r) e.r = r
        if (c > e.c) e.c = c
    }
    if (!칸있음) return null
    // sheetRows 로 잘린 시트는 원래 범위가 !fullref 에 남는다
    const 원래 = 시트['!fullref'] ? XLSX.utils.decode_range(시트['!fullref']) : null
    const 크다 = e.r - s.r + 1 > MAX_ROWS || e.c - s.c + 1 > MAX_COLS || (!!원래 && (원래.e.r - 원래.s.r + 1 > MAX_ROWS || 원래.e.c - 원래.s.c + 1 > MAX_COLS))
    if (!크다) return { 범위: { s, e }, 크다 }
    // 창 밖에 흩어진 칸(끝 칸 하나 등)은 버리고, 창 안에 실제로 있는 칸까지만 읽는다
    for (const { r, c } of 칸들) {
        if (r - s.r < MAX_ROWS && c - s.c < MAX_COLS) {
            if (r > 창.r) 창.r = r
            if (c > 창.c) 창.c = c
        }
    }
    return { 범위: { s, e: { r: Math.max(창.r, s.r), c: Math.max(창.c, s.c) } }, 크다 }
}

export async function parseExcel(buffer: Buffer, ext = ''): Promise<string> {
    let wb: XLSX.WorkBook
    try {
        if (ext === 'csv') {
            wb = XLSX.read(csv글(buffer), { type: 'string', sheetRows: MAX_ROWS + 1 })
        } else {
            await assertZipSafe(buffer)
            wb = XLSX.read(buffer, { type: 'buffer', sheetRows: MAX_ROWS + 1 })
        }
    } catch (err) {
        throw asPasswordError(err)
    }
    const 조각: string[] = []
    let 글자수 = 0
    for (const 시트이름 of wb.SheetNames) {
        if (글자수 > MAX_TEXT_CHARS) break
        const 시트 = wb.Sheets[시트이름]
        if (!시트) continue
        const 쓴 = 쓴범위(시트)
        if (!쓴) continue
        const { 범위, 크다 } = 쓴
        시트['!ref'] = XLSX.utils.encode_range(범위)
        const 표 = XLSX.utils.sheet_to_csv(시트, { blankrows: false })
        if (표.trim()) {
            조각.push(`[${시트이름}]\n${표.trim()}${크다 ? `\n${표큼}` : ''}`)
            글자수 += 표.length
        }
    }
    return limitText(조각.join('\n\n')).text
}
