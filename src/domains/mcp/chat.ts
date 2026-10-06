// domains/mcp — /api/chat 에서 부르는 한 줄짜리 입구
//
// 누구의 서버를 쓰나 = **대화하는 회원 본인**이 붙인 서버만, 그리고 **회원 본인이 만든 봇** 대화에서만.
//   남의 공개 봇과 대화하는 손님이 봇 주인의 열쇠로 도구를 부르게 되면 안 되고,
//   남이 만든 봇(지침을 남이 정함)이 내 열쇠로 내 도구를 부르게 해서도 안 된다.
// 도구 결과는 시스템 지침이 아니라 사용자 차례 앞 「자료」로 붙인다(material, 무작위 태그 울타리).
// 🛡 대화방 오염 표시: 이 대화방에서 도구 결과를 한 번이라도 썼으면 서버 표(mcp_session_taint)에 남기고,
//    그 대화방의 다음 대화는 처음부터 쓰기 도구를 숨긴다. 화면이 보내는 대화 기록이 아니라 서버 기록 기준.
// 모델 = 솔라(도구 호출 지원). 솔라 열쇠가 없으면 도구 단계를 건너뛴다(Gemini 도구 호출은 아직 안 붙였다).

import type { SupabaseClient } from '@supabase/supabase-js'
import { solarToolStep } from '@/domains/llm/solar-tools'
import { logLlmUsage } from '@/domains/llm/usage-log'
import { SOLAR_CHAT_MODEL } from '@/domains/llm/constants'
import { McpSession, type McpAuth, type McpTool } from './client'
import { assertBotsOwned, isSessionTainted, markMcpServer, markSessionTainted, serversForBot } from './store'
import { runToolPhase, toolMaterial, type ModelStep, type ToolPhaseResult } from './agent'

export interface McpChatOutcome {
    /** 이 봇에 쓸 서버가 하나라도 있었나 (있으면 의미 답 저장소를 쓰지 않는다) */
    hadServers: boolean
    /** 사용자 차례 앞에 붙일 자료 글 (도구 결과가 없으면 빈 글) */
    material: string
    sources: { id: string; title: string }[]
    phase: ToolPhaseResult | null
}

export async function runMcpForChat(input: {
    db: SupabaseClient
    userId: string
    botId: string
    /** 서버가 확인한 내 대화방 번호 (없으면 오염된 것으로 본다) */
    sessionId: string | null | undefined
    history: { role: string; content: string }[]
    modelStep?: ModelStep
    /** 시험용: MCP 서버에 붙는 방법 바꿔 끼우기 */
    connect?: (url: string, auth: McpAuth | null) => {
        listTools(deadline: number): Promise<McpTool[]>
        callTool(name: string, args: Record<string, unknown>, deadline: number): Promise<{ text: string; isError: boolean }>
    }
}): Promise<McpChatOutcome> {
    const empty: McpChatOutcome = { hadServers: false, material: '', sources: [], phase: null }
    const servers = await serversForBot(input.db, input.userId, input.botId)
    if (servers.length === 0) return empty
    // 내 봇이 아니면 아무것도 안 한다
    try { await assertBotsOwned(input.db, input.userId, [input.botId]) } catch { return empty }
    const step = input.modelStep ?? (process.env.UPSTAGE_API_KEY ? ((m, t, timeoutMs) => solarToolStep(m, t, { timeoutMs })) as ModelStep : null)
    if (!step) {
        console.warn('[Chat MCP] 도구 호출 모델(솔라 열쇠)이 없어 건너뜀')
        return { ...empty, hadServers: true }
    }

    const started = Date.now()
    const initiallyTainted = await isSessionTainted(input.db, input.userId, input.sessionId)
    const connect = input.connect ?? ((url: string, auth: McpAuth | null) => new McpSession(url, auth))
    const phase = await runToolPhase({
        initiallyTainted,
        servers: servers.map(s => {
            const session = connect(s.view.url, s.auth)
            return {
                id: s.view.id, name: s.view.name, allowedTools: s.view.allowedTools,
                listTools: deadline => session.listTools(deadline),
                callTool: (n, a, deadline) => session.callTool(n, a, deadline),
            }
        }),
        history: input.history
            .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
            .map(m => ({ role: m.role as 'user' | 'assistant', content: String(m.content ?? '') })),
        modelStep: step,
    })

    // 이번에 처음 오염됐으면 대화방에 표시. 다음 요청이 바로 봐야 하므로 기다린다
    if (phase.tainted && !initiallyTainted && input.sessionId) await markSessionTainted(input.db, input.userId, input.sessionId)

    // 서버 상태 남기기 (도구 목록을 못 받은 서버 = error). 기다리지 않는다
    for (const f of phase.failedServers) void markMcpServer(input.db, input.userId, f.serverId, { status: 'error', error: f.reason }).catch(() => {})

    if (phase.usage.prompt || phase.usage.completion) {
        logLlmUsage({
            route: '/api/chat', kind: 'mcp_tools', provider: 'solar', model: SOLAR_CHAT_MODEL,
            userId: input.userId, mentorId: input.botId,
            inputTokens: phase.usage.prompt, outputTokens: phase.usage.completion,
            latencyMs: Date.now() - started, ok: phase.stoppedBy !== 'model_error',
            meta: { calls: phase.calls.length, tools: phase.toolCount, stoppedBy: phase.stoppedBy, blockedWrites: phase.blockedWrites, initiallyTainted },
        })
    }
    console.log('[Chat MCP]', JSON.stringify({ servers: servers.length, tools: phase.toolCount, calls: phase.calls.length, blockedWrites: phase.blockedWrites, stoppedBy: phase.stoppedBy, failed: phase.failedServers.length }))

    return {
        hadServers: true,
        material: toolMaterial(phase.calls),
        sources: phase.calls.filter(c => c.ok).map((c, i) => ({ id: `mcp:${c.serverId}:${i}`, title: `MCP · ${c.serverName} · ${c.tool}` })),
        phase,
    }
}
