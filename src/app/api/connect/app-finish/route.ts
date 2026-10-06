// POST /api/connect/app-finish { handoff, appSecret } → 앱 OAuth 마무리(Bearer 필수).
//
// callback 이 임시 표에 둔 토큰을 한 번만 꺼내(DELETE ... RETURNING) 아래가 모두 맞을 때만 내 연결로 저장한다.
//  1) 임시 표의 user_id 가 지금 Bearer 로그인한 사람
//  2) sha256(appSecret) 이 시작할 때 낸 appProof 와 같다
//  3) 5분 안
// 어느 하나라도 틀리면 같은 말(400)로 거절한다. 꺼낸 행은 이미 지워져 다시 못 쓴다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import {
    ConnectorTableMissing, findProvider, openAppPending, proofMatches, readConnectorKey, replaceConnector, takeAppPending,
} from '@/domains/connectors'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const 거절 = () => NextResponse.json({ error: '연결을 마치지 못했어요. 처음부터 다시 연결해 주세요' }, { status: 400 })

export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const db = createAdminClient()
    const rl = await checkRateLimit(db, `connect-app-finish:${user.id}`, 10, 60)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('연결') }, { status: 429 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const handoff = typeof body.handoff === 'string' ? body.handoff : ''
    const appSecret = typeof body.appSecret === 'string' ? body.appSecret : ''
    if (!handoff || !appSecret || handoff.length > 200 || appSecret.length < 43 || appSecret.length > 200) return 거절() // 비밀값은 32바이트 이상 무작위(base64url 43자+)

    const key = readConnectorKey()
    if (!key) return NextResponse.json({ error: '연결 기능이 아직 준비 중이에요' }, { status: 503 })

    try {
        const row = await takeAppPending(db, handoff, user.id)
        if (!row) return 거절()
        if (row.user_id !== user.id || !proofMatches(appSecret, row.proof_hash)) return 거절()
        const p = findProvider(row.kind)
        if (!p) return 거절()
        await replaceConnector(db, user.id, {
            kind: p.id, label: p.name, secret: openAppPending(row, key), meta: row.meta ?? {},
        })
        return NextResponse.json({ connected: p.id })
    } catch (e) {
        if (e instanceof ConnectorTableMissing) return NextResponse.json({ error: '연결 기능이 아직 준비 중이에요' }, { status: 503 })
        console.error('[connect/app-finish]', e instanceof Error ? e.message : 'unknown')
        return NextResponse.json({ error: '연결을 저장하지 못했어요. 잠시 뒤 다시 해 주세요' }, { status: 500 })
    }
}
