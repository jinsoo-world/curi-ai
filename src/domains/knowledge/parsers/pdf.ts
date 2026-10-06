// PDF 글자 읽기 = unpdf (서버리스용 pdf.js 묶음, 2MB). 스캔본이라 글자가 거의 없으면 호출쪽이 업스테이지 OCR 로 넘긴다.
// 문서 객체에는 destroy 가 없어 loadingTask.destroy() 로 닫는다.
import { extractText, getDocumentProxy } from 'unpdf'
import { asPasswordError, limitText } from './safety'

export interface PdfText {
    text: string
    pages: number
}

async function 닫기(pdf: { loadingTask?: { destroy?: () => unknown } }) {
    await Promise.resolve(pdf.loadingTask?.destroy?.()).catch(() => {})
}

export async function parsePdf(buffer: Buffer): Promise<PdfText> {
    let pdf: Awaited<ReturnType<typeof getDocumentProxy>>
    try {
        pdf = await getDocumentProxy(new Uint8Array(buffer))
    } catch (err) {
        throw asPasswordError(err)
    }
    try {
        const { text, totalPages } = await extractText(pdf, { mergePages: true })
        const merged = Array.isArray(text) ? text.join('\n') : text
        return {
            text: limitText((merged || '')
                .replace(/\r\n?/g, '\n')
                .replace(/\n{3,}/g, '\n\n')
                .replace(/[ \t]{2,}/g, ' ')
                .trim()).text,
            pages: totalPages,
        }
    } finally {
        await 닫기(pdf)
    }
}

/** 쪽 수만 센다 (월 자료 한도 계산용) */
export async function countPdfPages(buffer: Buffer): Promise<number> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    try {
        return pdf.numPages
    } finally {
        await 닫기(pdf)
    }
}
