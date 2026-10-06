// 봇 답을 소리로 읽을 조각(문장 묶음)으로 나누는 규칙.
// 서버(/api/tts)와 웹 화면이 같은 규칙을 쓴다. 서버가 같은 규칙으로 나눠야
// 「이 메시지의 몇 번째 조각」이라는 요청이 서로 같은 글을 가리킨다.

/** 🚫 마크다운 제거 — 소리로 읽기 전 깨끗한 글로 바꾼다 */
export function stripMarkdown(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, '') // 코드 블록 제거
        .replace(/`([^`]+)`/g, '$1')    // 인라인 코드
        .replace(/#{1,6}\s*/g, '')       // 제목
        .replace(/\*\*([^*]+)\*\*/g, '$1') // 굵게
        .replace(/\*([^*]+)\*/g, '$1')     // 기울임
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')     // 취소선
        .replace(/>\s*/g, '')              // 인용
        .replace(/[-*+]\s+/g, '')          // 목록
        .replace(/\d+\.\s+/g, '')          // 번호 목록
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 링크
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // 이미지
        .replace(/\|[^|]*\|/g, '')         // 테이블
        .replace(/---+/g, '')              // 구분선
        .replace(/\n{3,}/g, '\n\n')        // 과도한 줄바꿈
        .trim()
}

/** ✂️ 문장 단위 분할 */
export function splitSentences(text: string): string[] {
    // 한국어: .다 / .요 / .까 등 + 영어: . ! ? 기준 분할
    const chunks = text.split(/(?<=[.!?다요까죠세])\s+/g).filter(s => s.trim().length > 5)
    if (chunks.length === 0) return [text]
    // 너무 짧은 조각은 합치기
    const merged: string[] = []
    let current = ''
    for (const chunk of chunks) {
        current += (current ? ' ' : '') + chunk
        if (current.length >= 40) {
            merged.push(current)
            current = ''
        }
    }
    if (current) merged.push(current)
    return merged
}

/** 한 번에 소리로 만드는 글자 수 상한 */
export const TTS_CHUNK_MAX = 500

/** 봇 답 한 건 → 읽을 조각 목록 (한 조각 500자 이하, 빈 조각 없음) */
export function answerToChunks(content: string): string[] {
    const clean = stripMarkdown(content)
    if (!clean) return []
    return splitSentences(clean).map(s => s.slice(0, TTS_CHUNK_MAX)).filter(s => s.trim().length > 0)
}

/** 공백 차이만 무시하고 비교하기 위한 정리 */
export function normalizeForMatch(text: string): string {
    return text.replace(/\s+/g, ' ').trim()
}

/** 소리로 읽는 문장의 최소 길이(이보다 짧은 조각은 따로 요청해 읽지 않는다) */
export const MIN_SPEAK_CHARS = 8

/** 마크다운·공백을 정리한 비교용 글 */
function plain(text: string): string {
    return normalizeForMatch(stripMarkdown(text))
}

/**
 * 봇의 답 조각이 바로 앞 사용자 말을 그대로 베낀 것인가.
 * 사용자가 글을 써 넣고 봇 목소리로 읽히게 하는 「따라 말하기」를 막는다.
 * - 사용자 말의 앞 30자(8자 이상)가 조각 안에 그대로 있으면 베낌
 * - 조각(8자 이상) 전체가 사용자 말 안에 그대로 들어 있어도 베낌
 */
export function echoesUserText(chunk: string, userText: string | null | undefined): boolean {
    if (!userText) return false
    const u = plain(userText)
    const c = plain(chunk)
    if (u.length < MIN_SPEAK_CHARS || c.length < MIN_SPEAK_CHARS) return false
    const head = u.slice(0, 30)
    return c.includes(head) || u.includes(c)
}

/**
 * 도장 찍힌 글(text) 안에서 sentence 가 「문장 경계에서 시작하는 한 구간」인가.
 * 경계 = 글 맨 앞이거나 바로 앞이 공백. 최소 8자. 단, 답의 맨 처음 문장(headOfAnswer)은 「네!」 같은 짧은 추임새라 2자부터 허용.
 */
export function isSentenceInText(sentence: string, text: string, headOfAnswer: boolean): boolean {
    const s = normalizeForMatch(sentence)
    const t = normalizeForMatch(text)
    if (!s) return false
    let at = t.indexOf(s)
    if (s.length < MIN_SPEAK_CHARS) {
        // 짧은 문장은 답의 맨 처음 것만
        return headOfAnswer && s.length >= 2 && t.startsWith(s)
    }
    while (at !== -1) {
        // 글 맨 앞(창은 답의 처음이거나 공백 뒤에서 시작한다) 또는 바로 앞이 공백
        if (at === 0 || t[at - 1] === ' ') return true
        at = t.indexOf(s, at + 1)
    }
    return false
}
