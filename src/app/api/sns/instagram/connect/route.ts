// 봇 「내 SNS 연결 — 인스타그램」 시작과 끊기.
//
// GET    /api/sns/instagram/connect?mentorId=… (또는 teamBotId=…)  웹(쿠키 로그인) → 인스타그램 로그인 화면으로 보낸다
// POST   /api/sns/instagram/connect { teamBotId | mentorId, appProof }  앱(Bearer) → { url } (앱이 시스템 브라우저로 연다)
//        appProof = 앱이 만든 비밀값의 sha256(소문자 hex 64자). 마무리(POST ./finish)에서 원문과 맞춰 본다(커넥터 앱 연결과 같은 방식)
// DELETE /api/sns/instagram/connect?teamBotId=… (또는 mentorId=…)  연결 끊기 = 열쇠만 지운다. 배운 글은 남는다 → 칸 4개 상태
//
// 🔒 봇 주인만. 권한은 instagram_business_basic 하나(내 프로필 + 내 게시물 읽기). 올리기·메시지 권한 없음.
// state = 사용자·봇·1회용 번호·출처를 서명(10분). 앱 설정 환경변수가 없으면 503 「곧 열려요」.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { readConnectorKey } from '@/domains/connectors/crypto'
import { BotNotMine } from '@/domains/os/knowledge'
import { FeedTableMissing } from '@/domains/os/feeds'
import { readBotSns, readPlanId } from '@/domains/os/bot-sns'
import { readInstagramConfig, signIgState, buildInstagramAuthUrl } from '@/domains/os/instagram/core'
import { disconnectInstagram, InstagramTableMissing } from '@/domains/os/instagram/store'
import { resolveInstagramBot } from '@/domains/os/instagram/owner'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const START_PER_MIN = 10
const PROOF_RE = /^[0-9a-f]{64}$/
const 곧 = () => NextResponse.json({ error: '곧 열려요', preparing: true }, { status: 503 })

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

function appUrl(req: NextRequest): string {
    return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
}

async function start(userId: string, ids: { mentorId?: unknown; teamBotId?: unknown }, src: 'web' | 'app', proof?: string): Promise<{ url: string } | NextResponse> {
    const cfg = readInstagramConfig()
    const key = readConnectorKey()
    if (!cfg || !key) return 곧()
    try {
        const db = createAdminClient()
        const mentorId = await resolveInstagramBot(db, userId, ids)
        const rl = await checkRateLimit(db, `ig-connect:${userId}`, START_PER_MIN, 60)
        if (!rl.allowed) return NextResponse.json({ error: '조금 뒤에 다시 해 주세요', retryAfterSec: 60 }, { status: 429 })
        const { state } = signIgState({ userId, mentorId, src, proof }, key)
        return { url: buildInstagramAuthUrl(cfg, state) }
    } catch (e) {
        if (e instanceof BotNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
        console.error('[sns/instagram/connect]', e instanceof Error ? e.message : 'unknown')
        return NextResponse.json({ error: '지금은 연결을 시작하지 못했어요. 잠시 후 다시 해 주세요' }, { status: 500 })
    }
}

export async function GET(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.redirect(`${appUrl(req)}/login?next=/os/settings`)
    const q = req.nextUrl.searchParams
    const r = await start(user.id, { mentorId: q.get('mentorId') ?? undefined, teamBotId: q.get('teamBotId') ?? undefined }, 'web')
    return r instanceof NextResponse ? r : NextResponse.redirect(r.url)
}

export async function POST(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const appProof = typeof body.appProof === 'string' ? body.appProof.toLowerCase() : ''
    if (!PROOF_RE.test(appProof)) return NextResponse.json({ error: 'appProof 가 필요해요(sha256 hex 64자)' }, { status: 400 })
    const r = await start(user.id, { mentorId: body.mentorId, teamBotId: body.teamBotId }, 'app', appProof)
    return r instanceof NextResponse ? r : NextResponse.json(r)
}

export async function DELETE(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const q = req.nextUrl.searchParams
    try {
        const db = createAdminClient()
        const mentorId = await resolveInstagramBot(db, user.id, { mentorId: q.get('mentorId') ?? undefined, teamBotId: q.get('teamBotId') ?? undefined })
        await disconnectInstagram(db, mentorId)
        const plan = await readPlanId(db, user.id)
        return NextResponse.json({ ok: true, ...(await readBotSns(db, mentorId, plan)) })
    } catch (e) {
        if (e instanceof BotNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
        if (e instanceof InstagramTableMissing || e instanceof FeedTableMissing) return NextResponse.json({ error: '곧 열려요', preparing: true }, { status: 503 })
        console.error('[sns/instagram/connect DELETE]', e instanceof Error ? e.message : 'unknown')
        return NextResponse.json({ error: '연결을 끊지 못했어요. 잠시 후 다시 해 주세요' }, { status: 500 })
    }
}
