// domains/mcp — /api/chat 에서 부르는 한 줄짜리 입구
//
// 누구의 서버를 쓰나 = **대화하는 회원 본인**이 붙인 서버만 (봇 주인 것이 아니다).
//   남의 공개 봇과 대화하는 손님이 봇 주인의 열쇠로 도구를 부르게 되면 안 되기 때문이다.
// 모델 = 솔라(도구 호출 지원). 솔라 열쇠가 없으면 도구 단계를 건너뛴다(Gemini 도구 호출은 아직 안 붙였다).

import type { SupabaseClient } from '@supabase/supabase-js'
import { solarToolStep } from '@/domains/llm/solar-tools'
import { logLlmUsage } from '@/domains/llm/usage-log'
import { SOLAR_CHAT_MODEL } from '@/domains/llm/constants'
import { McpSession } from './client'
import { markMcpServer, serversForBot } from './store'
import { runToolPhase, toolResultsPrompt, type ModelStep, type ToolPhaseResult } from './agent'

export interface McpChatOutcome {
    /** 이 봇에 쓸 서버가 하나라도 있었나 (있으면 의미 답 저장소를 쓰지 않는다) */
    hadServers: boolean
    /** 시스템 지침 앞에 붙일 글 (도구 결과가 없으면 빈 글) */
    prompt: string
    sources: { id: string; title: string }[]
    phase: ToolPhaseResult | null
}

export async function runMcpForChat(input: {
    db: SupabaseClient
    userId: string
    botId: string
    history: { role: string; content: string }[]
    modelStep?: ModelStep
}): Promise<McpChatOutcome> {
    const empty: McpChatOutcome = { hadServers: false, prompt: '', sources: [], phase: null }
    const servers = await serversForBot(input.db, input.userId, input.botId)
    if (servers.length === 0) return empty
    const step = input.modelStep ?? (process.env.UPSTAGE_API_KEY ? ((m, t) => solarToolStep(m, t)) as ModelStep : null)
    if (!step) {
        console.warn('[Chat MCP] 도구 호출 모델(솔라 열쇠)이 없어 건너뜀')
        return { ...empty, hadServers: true }
    }

    const started = Date.now()
    const phase = await runToolPhase({
        servers: servers.map(s => {
            const session = new McpSession(s.view.url, s.auth)
            return { id: s.view.id, name: s.view.name, listTools: () => session.listTools(), callTool: (n, a) => session.callTool(n, a) }
        }),
        history: input.history
            .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
            .map(m => ({ role: m.role as 'user' | 'assistant', content: String(m.content ?? '') })),
        modelStep: step,
    })

    // 서버 상태 남기기 (도구 목록을 못 받은 서버 = error). 기다리지 않는다
    for (const f of phase.failedServers) void markMcpServer(input.db, input.userId, f.serverId, { status: 'error', error: f.reason }).catch(() => {})

    if (phase.usage.prompt || phase.usage.completion) {
        logLlmUsage({
            route: '/api/chat', kind: 'mcp_tools', provider: 'solar', model: SOLAR_CHAT_MODEL,
            userId: input.userId, mentorId: input.botId,
            inputTokens: phase.usage.prompt, outputTokens: phase.usage.completion,
            latencyMs: Date.now() - started, ok: phase.stoppedBy !== 'model_error',
            meta: { calls: phase.calls.length, tools: phase.toolCount, stoppedBy: phase.stoppedBy },
        })
    }
    console.log('[Chat MCP]', JSON.stringify({ servers: servers.length, tools: phase.toolCount, calls: phase.calls.length, stoppedBy: phase.stoppedBy, failed: phase.failedServers.length }))

    return {
        hadServers: true,
        prompt: toolResultsPrompt(phase.calls),
        sources: phase.calls.filter(c => c.ok).map((c, i) => ({ id: `mcp:${c.serverId}:${i}`, title: `MCP · ${c.serverName} · ${c.tool}` })),
        phase,
    }
}
