// PATCH  /api/os/mcp/:id → 고치기 { name?, url?, authHeaderName?, authValue?(null=지우기), enabled?, botIds?(null=전체, 내 봇만), allowedTools? }
//   주소의 호스트가 바뀌는데 authValue 를 안 주면 저장된 인증 값은 지워진다.
// DELETE /api/os/mcp/:id → 떼기
// 🔒 남의 서버 번호를 보내도 user_id 가 안 맞으면 404.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteMcpServer, updateMcpServer } from '@/domains/mcp'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { mcpError, me, unauthorized } from '../shared'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await me()
    if (!user) return unauthorized()
    const { id } = await ctx.params
    const db = createAdminClient()
    const rl = await checkRateLimit(db, rateLimitKey('mcp-write', user.id, undefined, req), 20, 60)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('MCP 서버 저장') }, { status: 429 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    try {
        const server = await updateMcpServer(db, user.id, id, body)
        return NextResponse.json({ server })
    } catch (e) {
        return mcpError(e)
    }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
    const user = await me()
    if (!user) return unauthorized()
    const { id } = await ctx.params
    try {
        await deleteMcpServer(createAdminClient(), user.id, id)
        return NextResponse.json({ ok: true })
    } catch (e) {
        return mcpError(e)
    }
}
