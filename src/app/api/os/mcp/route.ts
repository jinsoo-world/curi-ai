// GET  /api/os/mcp  → 내 MCP 서버 목록 + 요금제 한도 (인증 값은 절대 안 나간다)
// POST /api/os/mcp  → 하나 붙이기 { name, url, authHeaderName?, authValue?, enabled?, botIds? }
//
// 🔒 첫 줄은 「로그인했나」(손님 401). 모든 DB 질의에 user_id 를 건다(서버는 service_role 로 RLS 를 우회한다).
// 🔐 CONNECTOR_SECRET_KEY 가 없으면 붙이기 자체가 막힌다(인증 값을 잠그지 않고 저장하는 길을 만들지 않는다).
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { connectorsEnabled } from '@/domains/connectors/crypto'
import { readPlanId } from '@/domains/os/usage-db'
import { createMcpServer, listMcpServers, mcpServerLimit } from '@/domains/mcp'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { mcpError, me, unauthorized } from './shared'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
    const user = await me()
    if (!user) return unauthorized()
    try {
        const db = createAdminClient()
        const [servers, plan] = await Promise.all([listMcpServers(db, user.id), readPlanId(db, user.id)])
        return NextResponse.json({ enabled: connectorsEnabled(), plan, limit: mcpServerLimit(plan), servers })
    } catch (e) {
        return mcpError(e)
    }
}

export async function POST(req: Request) {
    const user = await me()
    if (!user) return unauthorized()
    if (!connectorsEnabled()) return NextResponse.json({ error: 'MCP 연결 기능이 아직 준비 중이에요(서버 설정이 필요해요)' }, { status: 503 })
    const db = createAdminClient()
    const rl = await checkRateLimit(db, rateLimitKey('mcp-write', user.id, undefined, req), 20, 60)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('MCP 서버 저장') }, { status: 429 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    try {
        const plan = await readPlanId(db, user.id)
        const server = await createMcpServer(db, user.id, body, mcpServerLimit(plan))
        return NextResponse.json({ server }, { status: 201 })
    } catch (e) {
        return mcpError(e)
    }
}
