// POST /api/connect/notion/app-token { token } → 앱에서 노션 토큰을 붙여 넣어 저장(Bearer 로그인).
// 저장 규칙은 웹(/api/os/connectors POST)과 같다 = 모양 확인 → 노션에 읽기 한 번 → 잠가서 저장.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import {
    ConnectorTableMissing, connectorsEnabled, createConnector, looksLikeNotionToken, notionPing,
} from '@/domains/connectors'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    if (!connectorsEnabled()) {
        return NextResponse.json({ error: '연결 기능이 아직 준비 중이에요(서버 설정이 필요해요)' }, { status: 503 })
    }

    // 사용자별 분당 5회(노션에 토큰을 찍어 보는 시도를 막는다)
    const rl = await checkRateLimit(createAdminClient(), `notion-app-token:${user.id}`, 5, 60)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('연결') }, { status: 429 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const token = String(body.token ?? '').trim()
    if (!token) return NextResponse.json({ error: '붙여 넣을 값이 비어 있어요' }, { status: 400 })
    if (!looksLikeNotionToken(token)) {
        return NextResponse.json({ error: '노션 토큰이 아니에요. ntn_ 으로 시작하는 내부 통합 토큰을 붙여 넣어 주세요' }, { status: 400 })
    }
    try {
        await notionPing(token)
    } catch {
        return NextResponse.json({ error: '노션이 이 토큰을 받지 않았어요. 토큰을 다시 복사해 붙여 넣어 주세요' }, { status: 400 })
    }

    try {
        const view = await createConnector(createAdminClient(), user.id, { kind: 'notion', label: '노션', secret: token })
        return NextResponse.json({ connector: view })
    } catch (e) {
        if (e instanceof ConnectorTableMissing) return NextResponse.json({ error: '연결 기능이 아직 준비 중이에요' }, { status: 503 })
        const message = e instanceof Error ? e.message : ''
        // 개수 한도는 사용자가 바로 알아야 하는 말이라 그대로, 나머지(DB 오류 원문)는 일반 문구로
        if (message.endsWith('붙일 수 있어요')) return NextResponse.json({ error: message }, { status: 400 })
        console.error('[connect/notion/app-token]', message)
        return NextResponse.json({ error: '저장하지 못했어요. 잠시 뒤 다시 해 주세요' }, { status: 500 })
    }
}
