// POST /api/os/mcp/:id/test → 연결 시험. 서버에 붙어(initialize) 도구 목록을 받아 이름·설명만 돌려준다.
//   응답 { ok: true, serverName, tools: [{ name, description, readOnly, allowed }] } | { ok: false, error }
//   readOnly = 서버가 읽기 전용이라고 밝힌 도구. allowed = 지금 봇이 쓸 수 있나(읽기 전용이거나 allowedTools 에 적힌 쓰기 도구)
//   결과(상태·도구 수·한 줄 이유)는 표에 남긴다. 🔐 인증 값은 응답·로그·표 어디에도 안 남는다.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { McpError, McpSession, TOOL_PHASE_BUDGET_MS, markMcpServer, readMcpServerForUse } from '@/domains/mcp'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { mcpError, me, unauthorized } from '../../shared'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await me()
    if (!user) return unauthorized()
    const { id } = await ctx.params
    const db = createAdminClient()
    const rl = await checkRateLimit(db, rateLimitKey('mcp-test', user.id, undefined, req), 10, 60)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('연결 시험') }, { status: 429 })

    let target
    try {
        target = await readMcpServerForUse(db, user.id, id)
    } catch (e) {
        return mcpError(e)
    }
    try {
        const session = new McpSession(target.view.url, target.auth)
        const deadline = Date.now() + TOOL_PHASE_BUDGET_MS
        const { serverName } = await session.initialize(deadline)
        const tools = await session.listTools(deadline)
        await markMcpServer(db, user.id, id, { status: 'ok', toolCount: tools.length })
        return NextResponse.json({ ok: true, serverName, tools: tools.map(t => ({ name: t.name, description: t.description, readOnly: t.readOnly, allowed: t.readOnly || target.view.allowedTools.includes(t.name) })) })
    } catch (e) {
        const reason = e instanceof McpError ? e.message : '서버에 붙지 못했어요'
        await markMcpServer(db, user.id, id, { status: 'error', error: reason })
        return NextResponse.json({ ok: false, error: reason })
    }
}
