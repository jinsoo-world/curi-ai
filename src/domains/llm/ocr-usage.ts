// domains/llm = 업스테이지 문서 읽기(OCR, document-parse) 한 번마다 llm_usage 에 한 줄.
// 원화 = 쪽 수 x 쪽당 단가 (document-parse 0.01달러, ocr 0.0015달러, 1달러 1,356원). 회사 월 상한이 이 값을 더합니다.

import { logLlmUsage } from './usage-log'
import { upstageDocCostKrw } from '@/domains/knowledge/doc-parse'

export function logUpstageOcr(e: {
    route: string
    model: string
    ok: boolean
    body?: unknown
    status?: number
    error?: string | null
    mentorId?: string | null
    userId?: string | null
    /** 응답에 쪽 수가 없을 때 쓸 쪽 수 */
    pages?: number | null
    extra?: Record<string, unknown>
}): void {
    const bodyPages = (e.body as { usage?: { pages?: unknown } } | undefined)?.usage?.pages
    const pages = typeof bodyPages === 'number' ? bodyPages : (typeof e.pages === 'number' ? e.pages : null)
    logLlmUsage({
        route: e.route, kind: 'ocr', provider: 'upstage', model: e.model,
        mentorId: e.mentorId ?? null, userId: e.userId ?? null,
        ok: e.ok, error: e.error ?? null,
        costKrw: e.ok ? upstageDocCostKrw(e.model, pages) : 0,
        meta: { pages, ...(e.status ? { status: e.status } : {}), ...(e.extra ?? {}) },
    })
}
