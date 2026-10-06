// 솔라 도구 호출 한 걸음 — 요청 모양과 tool_calls 읽기
import { describe, it, expect } from 'vitest'
import { solarToolStep } from '../solar-tools'

describe('solarToolStep', () => {
    it('tools 를 실어 보내고 tool_calls 를 꺼낸다', async () => {
        let sent: Record<string, unknown> = {}
        const fetchImpl = (async (_url: string, init: RequestInit) => {
            sent = JSON.parse(String(init.body))
            return new Response(JSON.stringify({
                choices: [{ message: { content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'm0_0__search', arguments: '{"q":"a"}' } }] } }],
                usage: { prompt_tokens: 30, completion_tokens: 5, total_tokens: 35 },
            }), { status: 200 })
        }) as unknown as typeof fetch
        const tools = [{ type: 'function' as const, function: { name: 'm0_0__search', description: '찾기', parameters: { type: 'object' } } }]
        const r = await solarToolStep([{ role: 'user', content: '찾아줘' }], tools, { apiKey: 'k', fetchImpl })
        expect(sent).toMatchObject({ tools, tool_choice: 'auto', stream: false })
        expect(r).toEqual({ content: '', toolCalls: [{ id: 'call_1', name: 'm0_0__search', arguments: '{"q":"a"}' }], usage: { prompt: 30, completion: 5, total: 35 } })
    })

    it('실패 응답이면 던진다', async () => {
        const fetchImpl = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
        await expect(solarToolStep([], [], { apiKey: 'k', fetchImpl })).rejects.toThrow(/500/)
    })
})
