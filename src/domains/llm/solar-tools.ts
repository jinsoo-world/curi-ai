// domains/llm — 솔라 도구 호출(tool calling) 한 걸음. 흘려받지 않고 한 번에 받는다.
//
// solar-pro4 는 OpenAI 호환 tools / tool_calls 를 지원한다(constants.ts 실측 메모).
// MCP 도구 단계(domains/mcp/agent.ts)가 「어느 도구를 부를지」만 고를 때 쓴다. 최종 답은 기존 흘림 길이 만든다.

import { SOLAR_BASE_URL, SOLAR_CHAT_MODEL } from './constants'
import { SolarError } from './solar'
import type { LlmUsage } from './types'

export interface ToolLoopMessage {
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string
    tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
    tool_call_id?: string
}

export interface OpenAiTool {
    type: 'function'
    function: { name: string; description: string; parameters: Record<string, unknown> }
}

export interface ToolStepResult {
    content: string
    toolCalls: { id: string; name: string; arguments: string }[]
    usage: LlmUsage | null
}

export interface ToolStepOptions {
    apiKey?: string
    model?: string
    timeoutMs?: number
    fetchImpl?: typeof fetch
}

export async function solarToolStep(messages: ToolLoopMessage[], tools: OpenAiTool[], opts: ToolStepOptions = {}): Promise<ToolStepResult> {
    const apiKey = opts.apiKey ?? process.env.UPSTAGE_API_KEY
    if (!apiKey) throw new SolarError('UPSTAGE_API_KEY 가 없다', 0)
    const res = await (opts.fetchImpl ?? fetch)(`${SOLAR_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: opts.model ?? SOLAR_CHAT_MODEL,
            messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: 1024,
            stream: false,
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    })
    if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new SolarError(`솔라 도구 응답 ${res.status}: ${detail.slice(0, 200)}`, res.status)
    }
    const json = await res.json() as {
        choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] } }[]
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    }
    const msg = json.choices?.[0]?.message ?? {}
    const toolCalls = (msg.tool_calls ?? [])
        .map((t, i) => ({ id: String(t.id ?? `call_${i}`), name: String(t.function?.name ?? ''), arguments: String(t.function?.arguments ?? '{}') }))
        .filter(t => t.name)
    const u = json.usage
    const usage = u && typeof u.prompt_tokens === 'number' && typeof u.completion_tokens === 'number'
        ? { prompt: u.prompt_tokens, completion: u.completion_tokens, total: u.total_tokens ?? u.prompt_tokens + u.completion_tokens }
        : null
    return { content: String(msg.content ?? ''), toolCalls, usage }
}
