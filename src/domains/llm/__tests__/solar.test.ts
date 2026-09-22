import { describe, it, expect, vi } from 'vitest'
import { solarChatStream, SolarError } from '../solar'

function sseResponse(lines: string[], status = 200): Response {
    const enc = new TextEncoder()
    const body = new ReadableStream<Uint8Array>({
        start(c) {
            for (const l of lines) c.enqueue(enc.encode(l))
            c.close()
        },
    })
    return new Response(body, { status, headers: { 'content-type': 'text/event-stream' } })
}

describe('llm/solar — 업스테이지 솔라 스트림', () => {
    it('OpenAI 호환 주소로 stream:true 요청을 보내고 글 조각을 차례로 내놓는다', async () => {
        const fetchImpl = vi.fn(async () => sseResponse([
            'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"안녕"}}]}\n\n',
            'data: {"choices":[{"delta":{"content":"하세요"}}]}\n\n',
            'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":4,"total_tokens":14}}\n\n',
            'data: [DONE]\n\n',
        ]))

        const chunks: { text?: string; done?: boolean; usage?: unknown }[] = []
        for await (const c of solarChatStream('시스템', [{ role: 'user', content: '안녕' }], { apiKey: 'k', fetchImpl })) {
            chunks.push(c)
        }

        expect(chunks.filter(c => c.text).map(c => c.text)).toEqual(['안녕', '하세요'])
        const last = chunks[chunks.length - 1]
        expect(last.done).toBe(true)
        expect(last.usage).toEqual({ prompt: 10, completion: 4 })

        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
        expect(url).toBe('https://api.upstage.ai/v1/chat/completions')
        expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer k')
        const sent = JSON.parse(init.body as string)
        expect(sent.model).toBe('solar-pro4')
        expect(sent.stream).toBe(true)
        expect(sent.messages[0]).toEqual({ role: 'system', content: '시스템' })
    })

    it('서버가 200 이 아니면 상태 번호가 담긴 오류를 던진다(호출 쪽이 되돌아갈 수 있게)', async () => {
        const fetchImpl = vi.fn(async () => new Response('{"error":"quota"}', { status: 429 }))
        const it = solarChatStream('s', [{ role: 'user', content: 'x' }], { apiKey: 'k', fetchImpl })
        await expect(it.next()).rejects.toBeInstanceOf(SolarError)
        await expect(
            (async () => { for await (const _ of solarChatStream('s', [{ role: 'user', content: 'x' }], { apiKey: 'k', fetchImpl })) void _ })(),
        ).rejects.toMatchObject({ status: 429 })
    })

    it('열쇠가 없으면 부르기 전에 오류를 던진다', async () => {
        const fetchImpl = vi.fn()
        const it = solarChatStream('s', [{ role: 'user', content: 'x' }], { apiKey: '', fetchImpl })
        await expect(it.next()).rejects.toBeInstanceOf(SolarError)
        expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('모델 이름을 바꿔 부를 수 있다(미니 4 = 분류·요약용)', async () => {
        const fetchImpl = vi.fn(async () => sseResponse(['data: [DONE]\n\n']))
        for await (const _ of solarChatStream('s', [{ role: 'user', content: 'x' }], { apiKey: 'k', fetchImpl, model: 'solar-mini4' })) void _
        const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
        expect(JSON.parse(init.body as string).model).toBe('solar-mini4')
    })
})
