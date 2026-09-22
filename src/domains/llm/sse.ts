// domains/llm — 서버가 흘려주는 조각(SSE, text/event-stream) 읽기
//
// 조각은 네트워크 사정대로 아무 데서나 잘려 온다. JSON 한가운데서도 잘린다.
// 그래서 「빈 줄 두 개」로 끝난 사건만 꺼내고 나머지는 다음 조각에 이어 붙인다.

import type { LlmUsage } from './types'

const DONE = '[DONE]'

/**
 * 버퍼에서 완결된 사건들을 꺼낸다.
 * @returns events = 각 사건의 data 본문(여러 data 줄은 줄바꿈으로 이어짐), rest = 덜 온 나머지
 */
export function parseSseBuffer(buffer: string): { events: string[]; rest: string } {
    // 줄 끝 표기가 \r\n 인 서버도 있다. 하나로 통일한다.
    const normalized = buffer.replace(/\r\n/g, '\n')
    const blocks = normalized.split('\n\n')
    const rest = blocks.pop() ?? ''
    const events: string[] = []
    for (const block of blocks) {
        const dataLines = block
            .split('\n')
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).replace(/^ /, ''))
        if (dataLines.length === 0) continue   // 주석(:)·빈 사건
        events.push(dataLines.join('\n'))
    }
    return { events, rest }
}

/** 응답 본문을 끝까지 읽어 사건 본문을 하나씩 내놓는다. [DONE] 은 내놓지 않는다 */
export async function* readSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
        while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })
            const { events, rest } = parseSseBuffer(buffer)
            buffer = rest
            for (const ev of events) {
                if (ev.trim() === DONE) return
                yield ev
            }
        }
        // 마지막에 빈 줄 없이 끝난 사건 하나가 남을 수 있다
        const tail = parseSseBuffer(buffer + '\n\n').events
        for (const ev of tail) {
            if (ev.trim() === DONE) return
            yield ev
        }
    } finally {
        reader.releaseLock()
    }
}

/** OpenAI 호환 조각에서 글 조각만 꺼낸다. 없으면 빈 글자 */
export function extractDeltaText(payload: string): string {
    try {
        const json = JSON.parse(payload)
        const text = json?.choices?.[0]?.delta?.content
        return typeof text === 'string' ? text : ''
    } catch {
        return ''
    }
}

/** 마지막 조각에 실려 오는 사용량. 없으면 null */
export function extractUsage(payload: string): LlmUsage | null {
    try {
        const u = JSON.parse(payload)?.usage
        if (!u || typeof u.prompt_tokens !== 'number') return null
        return { prompt: u.prompt_tokens, completion: u.completion_tokens ?? 0 }
    } catch {
        return null
    }
}
