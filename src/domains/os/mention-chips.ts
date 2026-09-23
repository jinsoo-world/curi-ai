// @멘션 전달 표식을 말풍선/입력창에서 칩으로 쪼갠다 (순수 함수 = 시험 대상).
// 제품 카피에 가운뎃점 긴 줄표 금지.

export interface MentionChipBot {
    mentorId: string
    name: string
    shape?: string
    color?: string
    avatarUrl?: string | null
}

export type MentionSegment =
    | { kind: 'text'; text: string }
    | { kind: 'mention'; bot: MentionChipBot; raw: string }
    | { kind: 'handoff'; label: string; raw: string }

/** 「[이름 전달]」 / 「[이름이 전달]」 / 「[이름이 전달함]」 형태 */
const HANDOFF_RE = /\[([^\]\n]{1,40}?)\s*전달(?:함|해요|할게요)?\]/g

/**
 * 본문을 텍스트 / @멘션 칩 / 전달 칩 조각으로 나눈다.
 * 멘션은 봇 이름 목록 중 **가장 긴 이름**부터 맞춰 짧은 이름에 먹히지 않게 한다.
 */
export function splitMentionSegments(
    text: string,
    bots: readonly MentionChipBot[],
): MentionSegment[] {
    const src = text ?? ''
    if (!src) return []
    const names = [...bots]
        .filter(b => b?.name)
        .sort((a, b) => b.name.length - a.name.length)

    type Hit = { start: number; end: number; seg: MentionSegment }
    const hits: Hit[] = []

    for (const bot of names) {
        for (const at of ['@', '＠'] as const) {
            const token = `${at}${bot.name}`
            let from = 0
            while (from < src.length) {
                const i = src.indexOf(token, from)
                if (i < 0) break
                const end = i + token.length
                // 이미 덮인 구간이면 건너뛴다
                if (!hits.some(h => i < h.end && end > h.start)) {
                    hits.push({ start: i, end, seg: { kind: 'mention', bot, raw: token } })
                }
                from = end
            }
        }
    }

    HANDOFF_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = HANDOFF_RE.exec(src))) {
        const start = m.index
        const end = start + m[0].length
        if (hits.some(h => start < h.end && end > h.start)) continue
        const label = (m[1] ?? '').trim()
        if (!label) continue
        hits.push({ start, end, seg: { kind: 'handoff', label, raw: m[0] } })
    }

    hits.sort((a, b) => a.start - b.start || b.end - a.end)
    // 겹치면 먼저(더 앞, 더 긴) 것만
    const kept: Hit[] = []
    for (const h of hits) {
        if (kept.some(k => h.start < k.end && h.end > k.start)) continue
        kept.push(h)
    }

    const out: MentionSegment[] = []
    let cursor = 0
    for (const h of kept) {
        if (h.start > cursor) out.push({ kind: 'text', text: src.slice(cursor, h.start) })
        out.push(h.seg)
        cursor = h.end
    }
    if (cursor < src.length) out.push({ kind: 'text', text: src.slice(cursor) })
    if (out.length === 0) out.push({ kind: 'text', text: src })
    return out
}
