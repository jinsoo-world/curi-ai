// 메타 콜백 본문에서 signed_request 꺼내기 (보통 application/x-www-form-urlencoded, 가끔 JSON). 라우트 파일이 아니다.
import type { NextRequest } from 'next/server'

export async function readSignedRequest(req: NextRequest): Promise<string> {
    const text = (await req.text().catch(() => '')).slice(0, 8192)
    if (!text) return ''
    if (text.trimStart().startsWith('{')) {
        try {
            const j = JSON.parse(text) as Record<string, unknown>
            return typeof j.signed_request === 'string' ? j.signed_request : ''
        } catch { return '' }
    }
    return new URLSearchParams(text).get('signed_request') ?? ''
}
