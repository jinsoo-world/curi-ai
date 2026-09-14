// 48시간 지난 사진을 지운다 — 대표 지시 2026-09-15 「그 이후에는 없어진다고 해」
// 말만 하고 안 지우면 거짓말이 된다. 하루 두 번 돈다(vercel.json).
import { NextRequest, NextResponse } from 'next/server'
import { 만료된것_지우기 } from '@/lib/photo-store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
    const 열쇠 = process.env.CRON_SECRET
    if (열쇠 && req.headers.get('authorization') !== `Bearer ${열쇠}`) {
        return NextResponse.json({ error: 'no' }, { status: 401 })
    }
    const r = await 만료된것_지우기()
    return NextResponse.json({ success: true, ...r })
}
