// POST /api/os/connectors/[id]/test → 이 연결이 살아 있는지 한 번 확인한다.
//
//  - 노션: 「내 정보」를 한 번 물어본다(읽기만). 밖으로 나가는 것 없음.
//  - 슬랙: 웹훅은 확인만 하는 길이 없어서 **확인용 글 한 줄이 실제로 올라간다.**
//    그래서 사람이 단추를 직접 누르고 `confirm: true` 를 같이 보낼 때만 올린다.
//    ⚠️ 이건 사람이 자기 손으로 누른 확인이고, **봇이 스스로 슬랙에 글을 올리는 길이 아니다.**
//    봇이 올리려면 tool-gate 의 `slack_post`(되돌릴 수 없는 목록) → 승인 카드를 지나야 한다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ConnectorNotMine, markConnector, notionPing, readConnectorSecret, slackPing } from '@/domains/connectors'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const db = createAdminClient()
    const rl = await checkRateLimit(db, rateLimitKey('connector-test', user.id, null, req), 5, 60)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('연결 확인') }, { status: 429 })

    const { id } = await params
    const body = await req.json().catch(() => ({})) as Record<string, unknown>

    try {
        const { view, secret } = await readConnectorSecret(db, user.id, id)

        if (view.kind === 'notion') {
            const 작업공간 = await notionPing(secret)
            await markConnector(db, user.id, id, 'connected')
            return NextResponse.json({ ok: true, message: `노션에 잘 닿았어요 (${작업공간})` })
        }

        if (view.kind === 'slack') {
            if (body.confirm !== true) {
                return NextResponse.json({ error: '슬랙은 확인용 글 한 줄이 실제로 올라가요. 한 번 더 눌러 주세요' }, { status: 400 })
            }
            const r = await slackPing(secret)
            await markConnector(db, user.id, id, r.ok ? 'connected' : 'error')
            return r.ok
                ? NextResponse.json({ ok: true, message: '슬랙 방에 확인용 글을 올렸어요' })
                : NextResponse.json({ error: r.error ?? '슬랙에 닿지 못했어요' }, { status: 400 })
        }

        return NextResponse.json({ error: '아직 준비 중인 연결이에요' }, { status: 400 })
    } catch (e) {
        if (e instanceof ConnectorNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
        const message = e instanceof Error ? e.message : '연결을 확인하지 못했어요'
        await markConnector(db, user.id, id, 'error').catch(() => { /* 표시 실패는 넘어간다 */ })
        console.error('[os/connectors/test]', message)
        return NextResponse.json({ error: message }, { status: 400 })
    }
}
