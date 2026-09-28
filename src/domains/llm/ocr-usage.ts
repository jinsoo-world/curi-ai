// domains/llm = 업스테이지 문서 읽기(OCR, document-parse) 한 번마다 llm_usage 에 한 줄.
// 원화는 비워 둔다 (쪽당 가격을 아직 확인 못 했다. 모르는 값을 지어내지 않는다). 쪽 수는 남긴다.

import { logLlmUsage } from './usage-log'

export function logUpstageOcr(e: {
    route: string
    model: string
    ok: boolean
    body?: unknown
    status?: number
    error?: string | null
    mentorId?: string | null
    userId?: string | null
}): void {
    const pages = (e.body as { usage?: { pages?: unknown } } | undefined)?.usage?.pages
    logLlmUsage({
        route: e.route, kind: 'ocr', provider: 'upstage', model: e.model,
        mentorId: e.mentorId ?? null, userId: e.userId ?? null,
        ok: e.ok, error: e.error ?? null,
        meta: { pages: typeof pages === 'number' ? pages : null, ...(e.status ? { status: e.status } : {}) },
    })
}
