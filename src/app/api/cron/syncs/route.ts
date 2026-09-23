// GET /api/cron/syncs — 하루 한 번, 등록된 드라이브/노션 동기화를 전부 돌린다(수정된 것만 새로 넣는다).
//
// 열쇠 = CRON_SECRET (Authorization: Bearer …), routines 크론과 같은 규칙.
// 한 번에 너무 많이 돌면 시간이 넘친다 — MAX_PER_RUN 만큼만, 오래 안 돈 것부터.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { listDueCloudSyncs, runCloudSync } from '@/domains/os/cloudsync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PER_RUN = 15

function appUrl(req: NextRequest): string {
    return (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/+$/, '')
}

export async function GET(req: NextRequest) {
    const 열쇠 = process.env.CRON_SECRET
    if (!열쇠 || req.headers.get('authorization') !== `Bearer ${열쇠}`) {
        return NextResponse.json({ error: 'no' }, { status: 401 })
    }

    try {
        const db = createAdminClient()
        const base = appUrl(req)
        const 돌것 = await listDueCloudSyncs(db, MAX_PER_RUN)

        let 성공 = 0, 실패 = 0, 새자료 = 0
        for (const row of 돌것) {
            const result = await runCloudSync(db, row, base)
            if (result.ok) 성공++; else 실패++
            새자료 += result.itemCount
        }
        return NextResponse.json({ ok: true, ran: 돌것.length, 성공, 실패, 새자료 })
    } catch (e) {
        console.error('[cron/syncs]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '동기화를 돌리지 못했어요' }, { status: 500 })
    }
}
