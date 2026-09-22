// GET  /api/os/permissions?status=pending → 내 승인 카드 목록
// POST /api/os/permissions                → 승인 카드 만들기 (항상 pending 으로 시작)
//
// 🔒 service_role 로 DB 를 만지므로 모든 질의에 로그인한 사람의 user_id 를 건다.
//    허용해도 여기서 실제로 보내지 않는다. 보내는 일은 발신 담당이 나중에 따로 한다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    createPermissionRequest, listPermissionRequests, PermissionTableMissing,
} from '@/domains/agent/permissions'
import type { PermissionStatus } from '@/domains/agent/permissions'
import { IRREVERSIBLE_TOOLS } from '@/domains/agent/tool-gate'
import type { IrreversibleAction } from '@/domains/agent/tool-gate'

export const dynamic = 'force-dynamic'

const ACTION_OK = new Set<string>(Object.values(IRREVERSIBLE_TOOLS))
const STATUS_OK = new Set<string>(['pending', 'allowed', 'denied', 'edited_allowed', 'expired', 'all'])

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function GET(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const raw = req.nextUrl.searchParams.get('status') || 'pending'
    const status = (STATUS_OK.has(raw) ? raw : 'pending') as PermissionStatus | 'all'
    try {
        const cards = await listPermissionRequests(createAdminClient(), user.id, status)
        return NextResponse.json({ cards })
    } catch (e) {
        if (e instanceof PermissionTableMissing) return NextResponse.json({ cards: [], tableMissing: true })
        console.error('[os/permissions GET]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '카드를 불러오지 못했어요' }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const actionType = String(body.actionType ?? '')
    const summary = String(body.summary ?? '').trim()
    if (!ACTION_OK.has(actionType)) return NextResponse.json({ error: '무슨 행동인지 알 수 없어요' }, { status: 400 })
    if (!summary) return NextResponse.json({ error: '카드에 쓸 한 줄이 필요해요' }, { status: 400 })

    try {
        const card = await createPermissionRequest(createAdminClient(), user.id, {
            mentorId: body.mentorId ? String(body.mentorId) : null,
            sessionId: body.sessionId ? String(body.sessionId) : null,
            actionType: actionType as IrreversibleAction,
            summary,
            payload: (body.payload && typeof body.payload === 'object') ? body.payload as Record<string, unknown> : {},
        })
        return NextResponse.json({ card })
    } catch (e) {
        if (e instanceof PermissionTableMissing) {
            return NextResponse.json({ error: '승인 카드 표가 아직 준비되지 않았어요', tableMissing: true }, { status: 503 })
        }
        console.error('[os/permissions POST]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '카드를 만들지 못했어요' }, { status: 500 })
    }
}
