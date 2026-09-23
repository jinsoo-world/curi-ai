import { describe, it, expect } from 'vitest'
import { parseSseBuffer, readSseStream, extractDeltaText, extractUsage } from '../sse'

/** 문자열 조각들을 서버가 보내는 것처럼 흘려주는 가짜 스트림 */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder()
    return new ReadableStream({
        start(controller) {
            for (const c of chunks) controller.enqueue(enc.encode(c))
            controller.close()
        },
    })
}

describe('llm/sse — 서버가 흘려주는 조각 읽기', () => {
    it('빈 줄 두 개로 끝난 사건만 꺼내고, 덜 온 조각은 남겨둔다', () => {
        const { events, rest } = parseSseBuffer('data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c"')
        expect(events).toEqual(['{"a":1}', '{"b":2}'])
        expect(rest).toBe('data: {"c"')
    })

    it('주석 줄(:)과 빈 사건은 버린다', () => {
        const { events } = parseSseBuffer(': keep-alive\n\n\n\ndata: {"x":1}\n\n')
        expect(events).toEqual(['{"x":1}'])
    })

    it('한 사건이 data 줄 여러 개면 줄바꿈으로 이어붙인다', () => {
        const { events } = parseSseBuffer('data: 첫째\ndata: 둘째\n\n')
        expect(events).toEqual(['첫째\n둘째'])
    })

    it('JSON 이 조각 중간에서 잘려 와도 이어 붙여 읽는다', async () => {
        const body = streamOf([
            'data: {"choices":[{"delta":{"content":"안녕"}}]}\n\ndata: {"choices":[{"del',
            'ta":{"content":"하세요"}}]}\n\ndata: [DONE]\n\n',
        ])
        const got: string[] = []
        for await (const payload of readSseStream(body)) got.push(payload)
        // [DONE] 은 사건으로 내보내지 않는다
        expect(got).toHaveLength(2)
        expect(got.map(extractDeltaText)).toEqual(['안녕', '하세요'])
    })

    it('글이 없는 조각(역할 알림·빈 delta)은 빈 글자로 본다', () => {
        expect(extractDeltaText('{"choices":[{"delta":{"role":"assistant"}}]}')).toBe('')
        expect(extractDeltaText('{"choices":[]}')).toBe('')
        expect(extractDeltaText('이건 JSON 아님')).toBe('')
    })

    it('마지막 조각의 사용량(토큰 수)을 꺼낸다', () => {
        const u = extractUsage('{"choices":[],"usage":{"prompt_tokens":57,"completion_tokens":29,"total_tokens":86}}')
        expect(u).toEqual({ prompt: 57, completion: 29, total: 86 })
        expect(extractUsage('{"choices":[{"delta":{"content":"x"}}]}')).toBeNull()
    })
})
