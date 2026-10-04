// 「다시 시도」: 링크 하나만 다시 읽는다 (모델을 부르지 않는 가벼운 읽기, POST /api/os/twin-draft readOnly). 대표 지시 1005.
import { draftSourceChips, type DraftSourceKind } from '@/domains/os/twin-draft-shared'
import { readSummaryLine, type UnreadLink } from '@/domains/os/link-rules'

export type RetryResult = { ok: true; line: string } | { ok: false; unread: UnreadLink }

export async function retryLinkRead(url: string): Promise<RetryResult> {
    try {
        const r = await fetch('/api/os/twin-draft', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ links: [url], readOnly: true }),
        })
        const d = await r.json().catch(() => ({})) as { error?: string; read?: { count?: number; kind?: DraftSourceKind }[]; unread?: UnreadLink[] }
        if (!r.ok) return { ok: false, unread: { url, reason: d.error || '다시 읽지 못했어요', code: 'unknown' } }
        if (Array.isArray(d.read) && d.read.length > 0) {
            const counts: Partial<Record<DraftSourceKind, number>> = {}
            for (const x of d.read) { const k = x.kind ?? 'web'; counts[k] = (counts[k] ?? 0) + Math.max(1, x.count ?? 1) }
            return { ok: true, line: readSummaryLine(draftSourceChips(counts)) }
        }
        return { ok: false, unread: d.unread?.[0] ?? { url, reason: '읽을 글을 못 찾았어요', code: 'empty' } }
    } catch {
        return { ok: false, unread: { url, reason: '연결이 잠깐 끊겼어요. 다시 눌러 주세요', code: 'timeout' } }
    }
}
