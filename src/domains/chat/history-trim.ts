// domains/chat — 모델에게 넘기는 지난 대화 줄이기 (2026-10-06 멈춤 점검)
// 대화방이 길어지면 매번 지난 말 전부를 넘겨 첫 글자가 늦어지고 비용도 그만큼 늘었다.
// 최근 20턴(사용자+봇 40통) 또는 2만 자까지만 넘긴다. 마지막 사용자 말은 길어도 항상 넘긴다.

export const HISTORY_MAX_MESSAGES = 40
export const HISTORY_MAX_CHARS = 20_000

type Msg = { role?: string; content?: unknown }

export function trimHistory<T extends Msg>(messages: T[], opts: { maxMessages?: number; maxChars?: number } = {}): T[] {
    if (!Array.isArray(messages) || messages.length === 0) return []
    const maxMessages = opts.maxMessages ?? HISTORY_MAX_MESSAGES
    const maxChars = opts.maxChars ?? HISTORY_MAX_CHARS
    const kept: T[] = []
    let chars = 0
    for (let i = messages.length - 1; i >= 0; i--) {
        const len = String(messages[i]?.content ?? '').length
        // 마지막 말(이번 질문)은 항상 넣는다
        if (kept.length > 0 && (kept.length >= maxMessages || chars + len > maxChars)) break
        kept.unshift(messages[i])
        chars += len
    }
    // 인사(모델 말) 다음은 사용자 말로 시작해야 차례가 맞는다
    while (kept.length > 1 && kept[0]?.role !== 'user') kept.shift()
    return kept
}
