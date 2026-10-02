// GET    /api/os/block              → 내가 차단한 봇 { mentorIds, bots: [{ mentorId, name, avatarUrl, blockedAt }] }
// POST   /api/os/block { mentorId } → 차단 (마켓, 팀 목록, 대화, 그룹방, 전달, 루틴에서 나에게만 빠진다. 팀 줄 숨김, 루틴 멈춤)
// DELETE /api/os/block { mentorId } 또는 ?mentorId= → 차단 해제 (숨김, 루틴을 차단 전으로 되돌린다)
// 로그인 회원만 (쿠키 또는 앱 Bearer). 애플 심사 지침 1.2.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { isMentorId, mentorExists } from '@/domains/os/reports'
import { blockBot, unblockBot, listBlockedBots, ReportTableMissing } from '@/domains/os/blocks'

export const dynamic = 'force-dynamic'

async function signedIn() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

const LOGIN = () => NextResponse.json({ error: '로그인하면 차단할 수 있어요' }, { status: 401 })
const NOT_READY = () => NextResponse.json({ error: '차단을 받을 준비가 아직 안 됐어요' }, { status: 503 })

export async function GET() {
    const user = await signedIn()
    if (!user) return LOGIN()
    try {
        const bots = await listBlockedBots(createAdminClient(), user.id)
        return NextResponse.json({ mentorIds: bots.map(b => b.mentorId), bots })
    } catch (e) {
        console.error('[os/block GET]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '차단 목록을 못 읽었어요' }, { status: 500 })
    }
}

async function readMentorId(req: Request): Promise<string | null> {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const v = body?.mentorId ?? new URL(req.url).searchParams.get('mentorId')
    return isMentorId(v) ? v : null
}

async function change(req: Request, kind: 'block' | 'unblock') {
    const user = await signedIn()
    if (!user) return LOGIN()
    const db = createAdminClient()
    const rl = await checkRateLimit(db, rateLimitKey('block', user.id), 30, 60)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('차단 요청') }, { status: 429 })
    const mentorId = await readMentorId(req)
    if (!mentorId) return NextResponse.json({ error: '어느 봇인지 알 수 없어요' }, { status: 400 })
    try {
        if (kind === 'block') {
            if (!(await mentorExists(db, mentorId))) return NextResponse.json({ error: '그 봇을 찾지 못했어요' }, { status: 404 })
            await blockBot(db, user.id, mentorId)
        } else {
            await unblockBot(db, user.id, mentorId)
        }
        return NextResponse.json({ ok: true, blocked: kind === 'block' })
    } catch (e) {
        if (e instanceof ReportTableMissing) return NOT_READY()
        console.error(`[os/block ${kind}]`, e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '처리하지 못했어요. 잠시 뒤 다시 해 주세요' }, { status: 500 })
    }
}

export async function POST(req: Request) { return change(req, 'block') }
export async function DELETE(req: Request) { return change(req, 'unblock') }
