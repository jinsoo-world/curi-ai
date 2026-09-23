// domains/os — Q&A CSV 파싱. 델파이급 Knowledge 보강 갈래B: 「질문,답」 두 칸짜리 CSV를 자료로 올린다.
// 서버·클라이언트 어디서나 쓸 수 있게 순수 함수만 둔다(다른 도메인 안 부름, 부작용 없음).
//
// 왜 문자 단위로 읽나 = 엑셀·구글시트가 저장한 CSV는 칸 안에 쉼표·줄바꿈·큰따옴표가 그대로 들어 있을 수 있다
// (큰따옴표로 감싸고, 안의 큰따옴표는 두 번 써서 "" 로 이스케이프한다 = RFC4180). 줄 단위로 나눠 읽으면
// 답 안의 줄바꿈에서 그 답이 두 줄로 쪼개진다. 그래서 통째로 한 글자씩 읽는다.

export interface QaCsvRow {
    question: string
    answer: string
}

/** 머리글 줄(「질문,답」류)로 볼 낱말 — 대소문자 안 가림 */
const HEADER_Q = new Set(['질문', '물음', 'question', 'q'])
const HEADER_A = new Set(['답', '답변', 'answer', 'a'])

/** CSV 원문 → 칸(cell) 단위 2차원 배열 (RFC4180과 비슷하게 읽는다) */
function parseCsvCells(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let inQuotes = false
    const src = (text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')

    for (let i = 0; i < src.length; i++) {
        const ch = src[i]
        if (inQuotes) {
            if (ch === '"') {
                if (src[i + 1] === '"') { cell += '"'; i++ } else { inQuotes = false }
            } else {
                cell += ch
            }
            continue
        }
        if (ch === '"') { inQuotes = true; continue }
        if (ch === ',') { row.push(cell); cell = ''; continue }
        if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue }
        cell += ch
    }
    // 줄바꿈 없이 글이 끝난 경우(마지막 줄)도 담는다
    if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row) }
    return rows
}

/**
 * 질문,답 두 칸짜리 CSV → Q&A 쌍 목록.
 * - 맨 위 머리글 줄(「질문,답」류)은 자동으로 건너뛴다.
 * - 빈 줄, 질문·답 어느 한쪽이라도 빈 줄은 버린다(반쪽짜리는 자료로 못 쓴다).
 * - 셋째 칸부터는 무시한다(두 칸만 본다).
 */
export function parseQaCsv(text: string): QaCsvRow[] {
    const rows = parseCsvCells(text)
    const out: QaCsvRow[] = []
    let sawFirstRow = false

    for (const cells of rows) {
        if (cells.every(c => c.trim() === '')) continue   // 빈 줄

        const question = (cells[0] ?? '').trim()
        const answer = (cells[1] ?? '').trim()

        if (!sawFirstRow) {
            sawFirstRow = true
            if (HEADER_Q.has(question.toLowerCase()) && HEADER_A.has(answer.toLowerCase())) continue
        }

        if (!question || !answer) continue
        out.push({ question, answer })
    }
    return out
}
