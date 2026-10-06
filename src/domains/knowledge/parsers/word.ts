import { assertZipSafe, asPasswordError, limitText } from './safety'

// 워드 읽기. docx 는 mammoth(1.13), 옛 형식 doc(워드 97~2003)는 word-extractor.
// 확장자가 거짓이어도 파일 앞머리(PK = docx, D0CF = 옛 doc)로 가른다.

function 글Clean(글: string): string {
    return limitText((글 || '')
        .replace(/\r\n?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')   // 3줄 이상 연속 빈줄 → 2줄로
        .replace(/[ \t]{2,}/g, ' ')   // 연속 공백 → 1칸으로
        .trim()).text
}

export async function parseDocx(buffer: Buffer): Promise<string> {
    await assertZipSafe(buffer)
    const mammoth = await import('mammoth')
    try {
        const result = await mammoth.extractRawText({ buffer })
        return 글Clean(result.value)
    } catch (err) {
        throw asPasswordError(err)
    }
}

export async function parseDoc(buffer: Buffer): Promise<string> {
    const { default: WordExtractor } = await import('word-extractor')
    try {
        const doc = await new WordExtractor().extract(buffer)
        return 글Clean(doc.getBody())
    } catch (err) {
        throw asPasswordError(err)
    }
}

export async function parseWord(buffer: Buffer): Promise<string> {
    const zip = buffer[0] === 0x50 && buffer[1] === 0x4b
    return zip ? parseDocx(buffer) : parseDoc(buffer)
}
