// POST /api/sns/instagram/finish { handoff, appSecret } → 앱 인스타그램 연결 마무리 (Bearer 필수).
//
// 콜백이 임시 표(connector_app_pending, 5분)에 잠가 둔 연결을 한 번만 꺼내(DELETE ... RETURNING) 아래가 모두 맞을 때만 저장한다.
//  1) 임시 표의 사람이 지금 Bearer 로그인한 사람  2) sha256(appSecret) 이 시작할 때 낸 appProof  3) 종류가 인스타그램  4) 아직 봇 주인
// 틀리면 같은 말(400)로 거절. 꺼낸 행은 이미 지워져 다시 못 쓴다. 커넥터 앱 마무리(/api/connect/app-finish)와 같은 방식.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { readConnectorKey } from '@/domains/connectors/crypto'
import { takeAppPending, proofMatches, openAppPending } from '@/domains/connectors/app-state'
import { ConnectorTableMissing } from '@/domains/connectors/store'
import { BotNotMine, assertBotOwned } from '@/domains/os/knowledge'
import { FeedTableMissing } from '@/domains/os/feeds'
import { IG_PENDING_KIND } from '@/domains/os/instagram/core'
import type { InstagramLogin } from '@/domains/os/instagram/api'
import { saveInstagramConnection, InstagramTableMissing, InstagramTooManyFeeds } from '@/domains/os/instagram/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const 거절 = () => NextResponse.json({ error: '연결을 마치지 못했어요. 처음부터 다시 연결해 주세요' }, { status: 400 })

function isLogin(v: unknown): v is InstagramLogin {
    const l = v as Record<string, unknown> | null
    return !!l && ['accessToken', 'expiresAt', 'igUserId', 'igScopedId', 'username', 'accountType'].every(k => typeof l[k] === 'string' && l[k])
}

export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const db = createAdminClient()
    const rl = await checkRateLimit(db, `ig-finish:${user.id}`, 10, 60)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('연결') }, { status: 429 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const handoff = typeof body.handoff === 'string' ? body.handoff : ''
    const appSecret = typeof body.appSecret === 'string' ? body.appSecret : ''
    if (!handoff || !appSecret || handoff.length > 200 || appSecret.length < 43 || appSecret.length > 200) return 거절()

    const key = readConnectorKey()
    if (!key) return NextResponse.json({ error: '곧 열려요', preparing: true }, { status: 503 })

    try {
        const row = await takeAppPending(db, handoff, user.id)
        if (!row || row.user_id !== user.id || row.kind !== IG_PENDING_KIND || !proofMatches(appSecret, row.proof_hash)) return 거절()
        const mentorId = typeof row.meta?.mentorId === 'string' ? row.meta.mentorId : ''
        if (!mentorId) return 거절()
        await assertBotOwned(db, user.id, mentorId)
        let login: unknown
        try { login = JSON.parse(openAppPending(row, key)) } catch { return 거절() }
        if (!isLogin(login)) return 거절()
        await saveInstagramConnection(db, key, { userId: user.id, mentorId, login })
        return NextResponse.json({ connected: 'instagram', username: login.username })
    } catch (e) {
        if (e instanceof BotNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
        if (e instanceof InstagramTooManyFeeds) return NextResponse.json({ error: e.message }, { status: 400 })
        if (e instanceof ConnectorTableMissing || e instanceof InstagramTableMissing || e instanceof FeedTableMissing) return NextResponse.json({ error: '곧 열려요', preparing: true }, { status: 503 })
        console.error('[sns/instagram/finish]', e instanceof Error ? e.message : 'unknown')
        return NextResponse.json({ error: '연결을 저장하지 못했어요. 잠시 뒤 다시 해 주세요' }, { status: 500 })
    }
}
