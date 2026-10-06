// PDF 글자 읽기 = unpdf (서버리스용 pdf.js 묶음, 2MB). 스캔본이라 글자가 거의 없으면 호출쪽이 업스테이지 OCR 로 넘긴다.
// 문서 객체에 destroy 가 없는 축소판이라 따로 닫지 않는다 (함수가 끝나면 풀린다).
import { extractText, getDocumentProxy } from 'unpdf'

export interface PdfText {
    text: string
    pages: number
}

export async function parsePdf(buffer: Buffer): Promise<PdfText> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text, totalPages } = await extractText(pdf, { mergePages: true })
    const merged = Array.isArray(text) ? text.join('\n') : text
    return {
        text: (merged || '')
            .replace(/\r\n?/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]{2,}/g, ' ')
            .trim(),
        pages: totalPages,
    }
}

/** 쪽 수만 센다 (월 자료 한도 계산용) */
export async function countPdfPages(buffer: Buffer): Promise<number> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    return pdf.numPages
}
