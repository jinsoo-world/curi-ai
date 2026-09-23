// GET    /api/os/knowledge/cloud?mentorId=            → 이 봇에 등록된 드라이브/노션 동기화 목록
// POST   /api/os/knowledge/cloud                       → 고른 폴더/문서를 등록 + 바로 한 번 가져오기
//        body { mentorId, provider, items:[{id,name}] }
// POST   /api/os/knowledge/cloud (action:'run')        → 등록된 것 하나를 「지금 가져오기」
//        body { mentorId, syncId, action:'run' }
// DELETE /api/os/knowledge/cloud                       → 동기화 등록 떼기(이미 넣은 자료는 남는다)
//        body { mentorId, syncId }
//
// 🔒 첫 줄은 항상 「내 팀 봇인가」(assertBotOwned) 확인.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertBotOwned, BotNotMine } from '@/domains/os/knowledge'
import {
    cleanCloudProvider, listCloudSyncs, registerCloudSyncs, deleteCloudSync, getCloudSyncRow, runCloudSync,
    CloudNotConnected, type CloudPickItem,
} from '@/domains/os/cloudsync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function appUrl(req: NextRequest): string {
    return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
}

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

function 오류응답(e: unknown) {
    if (e instanceof BotNotMine) return NextResponse.json({ error: '권한이 없어요' }, { status: 403 })
    if (e instanceof CloudNotConnected) return NextResponse.json({ error: e.message, needConnect: true }, { status: 409 })
    const message = e instanceof Error ? e.message : '처리하지 못했어요'
    console.error('[os/knowledge/cloud]', message)
    return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const mentorId = req.nextUrl.searchParams.get('mentorId') || ''
    try {
        const db = createAdminClient()
        const syncs = await listCloudSyncs(db, user.id, mentorId)
        return NextResponse.json({ syncs })
    } catch (e) {
        return 오류응답(e)
    }
}

export async function POST(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mentorId = String(body.mentorId ?? '')
    const base = appUrl(req)

    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)

        if (body.action === 'run') {
            const syncId = String(body.syncId ?? '')
            const row = await getCloudSyncRow(db, user.id, syncId)
            if (!row || row.mentorId !== mentorId) return NextResponse.json({ error: '그 동기화를 못 찾았어요' }, { status: 404 })
            const result = await runCloudSync(db, row, base)
            return NextResponse.json({ ran: 1, ...result })
        }

        const provider = cleanCloudProvider(body.provider)
        const items = Array.isArray(body.items) ? (body.items as CloudPickItem[]).filter(it => it && it.id) : []
        if (!provider) return NextResponse.json({ error: '드라이브나 노션 중 하나를 골라 주세요' }, { status: 400 })

        const registered = await registerCloudSyncs(db, user.id, mentorId, provider, items)
        let 성공 = 0, 실패 = 0
        for (const r of registered) {
            const row = await getCloudSyncRow(db, user.id, r.id)
            if (!row) continue
            const result = await runCloudSync(db, row, base)
            if (result.ok) 성공++; else 실패++
        }
        const syncs = await listCloudSyncs(db, user.id, mentorId)
        return NextResponse.json({ registered: registered.length, 성공, 실패, syncs })
    } catch (e) {
        return 오류응답(e)
    }
}

export async function DELETE(req: NextRequest) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const mentorId = String(body.mentorId ?? '')
    const syncId = String(body.syncId ?? '')
    try {
        const db = createAdminClient()
        await assertBotOwned(db, user.id, mentorId)
        await deleteCloudSync(db, user.id, syncId)
        return NextResponse.json({ ok: true })
    } catch (e) {
        return 오류응답(e)
    }
}
