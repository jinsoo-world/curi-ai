// 한글(hwp 5.0·3.0, hwpx) 로컬 읽기 = kordoc 4.18.13 (MIT, 정확히 고정).
// 업스테이지 Document Parse 가 꺼졌거나 월 상한·실패일 때만 여기로 온다.
// OCR(AI 모델 실행)·PDF 렌더 같은 큰 선택 부품은 설치하지 않았다(package.json overrides).
// 그래서 ocr 는 항상 끈다. 켜면 없는 부품을 찾다 실패한다.
import { assertZipSafe, asPasswordError, limitText, PasswordProtectedError } from './safety'

export async function parseHangul(buffer: Buffer): Promise<string> {
    await assertZipSafe(buffer)
    const { parse } = await import('kordoc')
    const r = await parse(buffer, { ocr: false })
    if (!r.success) {
        if ((r as { code?: string }).code === 'ENCRYPTED') throw new PasswordProtectedError()
        throw asPasswordError(new Error(`kordoc: ${r.error ?? '읽기 실패'}`))
    }
    return limitText((r.markdown || '').replace(/\n{3,}/g, '\n\n').trim()).text
}
