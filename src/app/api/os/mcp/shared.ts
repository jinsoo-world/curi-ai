// /api/os/mcp 창구들이 같이 쓰는 것: 로그인 확인, 오류 응답 모양
// 🔐 어떤 응답에도 인증 값(원문·암호문)을 담지 않는다. 오류 글은 우리가 만든 한 줄만.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ConnectorKeyMissing } from '@/domains/connectors/crypto'
import { McpInputError, McpLimitReached, McpNotMine, McpTableMissing } from '@/domains/mcp'

/** 웹은 쿠키, 앱은 Authorization: Bearer 로 로그인 (lib/supabase/server 가 둘 다 받는다) */
export async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export const unauthorized = () => NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

export function mcpError(e: unknown) {
    if (e instanceof McpNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 404 })
    if (e instanceof McpLimitReached) return NextResponse.json({ error: e.message, limit: e.limit }, { status: 403 })
    if (e instanceof McpInputError) return NextResponse.json({ error: e.message }, { status: 400 })
    if (e instanceof McpTableMissing || e instanceof ConnectorKeyMissing) {
        return NextResponse.json({ error: 'MCP 연결 기능이 아직 준비 중이에요' }, { status: 503 })
    }
    console.error('[os/mcp]', e instanceof Error ? e.name : 'unknown')
    return NextResponse.json({ error: 'MCP 서버를 다루지 못했어요' }, { status: 500 })
}
