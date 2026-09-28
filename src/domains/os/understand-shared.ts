// domains/os: 「봇이 이렇게 이해했어요」 카드 모양 (화면과 서버가 같이 쓴다. 서버 전용 코드 없음). 대표 결정 0929 00:54.
// 자료나 링크를 넣은 뒤 봇이 배운 것(주제, 말투, 핵심 사실)을 짧게 보여 주고, 주인이 고치면 봇 설명(지침)에 저장한다.

export interface Understanding {
    topics: string[]
    tone: string
    facts: string[]
}

export const UNDERSTAND_LIMITS = { topics: 5, topicChars: 20, toneChars: 80, facts: 5, factChars: 100 } as const

export const UNDERSTAND_COPY = {
    title: '봇이 이렇게 이해했어요',
    loading: '봇이 정리하는 중이에요',
    topics: '주제',
    tone: '말투',
    facts: '핵심',
    save: '이대로 저장',
    saved: '봇 설명에 저장했어요',
    skip: '닫기',
    fail: '정리하지 못했어요. 자료는 들어갔어요',
} as const

function line(v: unknown, max: number): string {
    return String(v ?? '').replace(/\s*[—–]\s*/g, ' ').replace(/\s*·\s*/g, ', ').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** 모델 답이나 화면 입력 → 정리된 카드. 빈 칸은 뺀다 */
export function tidyUnderstanding(raw: unknown): Understanding {
    const o = (raw ?? {}) as Record<string, unknown>
    const L = UNDERSTAND_LIMITS
    const list = (v: unknown, n: number, max: number) =>
        (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\n|,/) : []).map(x => line(x, max)).filter(Boolean).slice(0, n)
    return { topics: list(o.topics, L.topics, L.topicChars), tone: line(o.tone, L.toneChars), facts: list(o.facts, L.facts, L.factChars) }
}

export function isEmptyUnderstanding(u: Understanding): boolean {
    return u.topics.length === 0 && !u.tone && u.facts.length === 0
}
