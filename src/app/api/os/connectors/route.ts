// GET    /api/os/connectors  → 내가 붙여 둔 연결 목록 (열쇠는 절대 안 나간다)
// POST   /api/os/connectors  → 연결 하나 붙이기 { kind, label, secret }
// DELETE /api/os/connectors  → 연결 하나 떼기 { id }
//
// 🔒 어느 창구든 첫 줄은 「로그인했나」, 모든 DB 질의에 user_id 를 건다(서버는 service_role 로 RLS 를 우회한다).
// 🔐 CONNECTOR_SECRET_KEY 가 없으면 붙이기 자체가 막힌다(열쇠를 잠그지 않고 저장하는 길을 만들지 않는다).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    ConnectorNotMine, ConnectorTableMissing, cleanKind, connectorsEnabled, createConnector,
    deleteConnector, isReadyKind, listConnectors, isSlackWebhookUrl, looksLikeNotionToken,
} from '@/domains/connectors'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

function 오류응답(e: unknown) {
    if (e instanceof ConnectorNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
    if (e instanceof ConnectorTableMissing) return NextResponse.json({ error: '연결 기능이 아직 준비 중이에요' }, { status: 503 })
    const message = e instanceof Error ? e.message : '연결을 다루지 못했어요'
    console.error('[os/connectors]', message)
    return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET() {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    try {
        return NextResponse.json({
            enabled: connectorsEnabled(),
            connectors: await listConnectors(createAdminClient(), user.id),
        })
    } catch (e) {
        return 오류응답(e)
    }
}

export async function POST(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    if (!connectorsEnabled()) {
        return NextResponse.json({ error: '연결 기능이 아직 준비 중이에요(서버 설정이 필요해요)' }, { status: 503 })
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const kind = cleanKind(body.kind)
    const secret = String(body.secret ?? '').trim()

    if (!kind) return NextResponse.json({ error: '우리가 아는 연결 종류가 아니에요' }, { status: 400 })
    if (!isReadyKind(kind)) return NextResponse.json({ error: '아직 준비 중인 연결이에요' }, { status: 400 })
    if (!secret) return NextResponse.json({ error: '붙여 넣을 값이 비어 있어요' }, { status: 400 })

    // 모양부터 본다 — 엉뚱한 값을 잠가서 넣어 두면 나중에 왜 안 되는지 알기 어렵다
    if (kind === 'slack' && !isSlackWebhookUrl(secret)) {
        return NextResponse.json({ error: '슬랙 웹훅 주소가 아니에요. https://hooks.slack.com/services/… 를 붙여 넣어 주세요' }, { status: 400 })
    }
    if (kind === 'notion' && !looksLikeNotionToken(secret)) {
        return NextResponse.json({ error: '노션 토큰이 아니에요. ntn_ 으로 시작하는 내부 통합 토큰을 붙여 넣어 주세요' }, { status: 400 })
    }

    try {
        const view = await createConnector(createAdminClient(), user.id, {
            kind, label: String(body.label ?? ''), secret,
        })
        return NextResponse.json({ connector: view })
    } catch (e) {
        return 오류응답(e)
    }
}

export async function DELETE(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    try {
        await deleteConnector(createAdminClient(), user.id, String(body.id ?? ''))
        return NextResponse.json({ ok: true })
    } catch (e) {
        return 오류응답(e)
    }
}
