// 엑셀·CSV 읽기. SheetJS 0.20.3 (npm 이 아닌 공식 서버판, 취약점 수리판)
// 표는 시트마다 제목을 달고 줄로 편다. AI 가 읽을 때 어느 표의 어느 칸인지 알아야 한다.
import * as XLSX from 'xlsx'

/** CSV 는 바이트로 넘기면 SheetJS 가 한글을 깨뜨린다(1252 로 읽음). 직접 UTF-8, 안 되면 한국 엑셀 기본인 EUC-KR(CP949)로 푼다 */
function csv글(buffer: Buffer): string {
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    } catch {
        return new TextDecoder('euc-kr').decode(buffer)
    }
}

export function parseExcel(buffer: Buffer, ext = ''): string {
    const wb = ext === 'csv'
        ? XLSX.read(csv글(buffer), { type: 'string' })
        : XLSX.read(buffer, { type: 'buffer' })
    const 조각: string[] = []
    for (const 시트이름 of wb.SheetNames) {
        const 시트 = wb.Sheets[시트이름]
        if (!시트) continue
        const 표 = XLSX.utils.sheet_to_csv(시트, { blankrows: false })
        if (표.trim()) 조각.push(`[${시트이름}]\n${표.trim()}`)
    }
    return 조각.join('\n\n')
}
