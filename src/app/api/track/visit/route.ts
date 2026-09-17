/**
 * 어디서 들어왔는지 한 줄 남긴다 — 대표 지시 2026-09-17 「1,2 둘다」
 *
 * 왜 =  공유 링크에는 utm(어디서 눌렀는지)이 붙는데 그걸 받아 적는 곳이 없었다.
 *       그래서 카톡방에 뿌린 링크로 몇 명이 왔는지 셀 수가 없었다(2026-09-16 실측: GTM 은 ID 가 비어 껍데기).
 *
 * 무엇을 남기나 = 언제 · 어느 화면 · utm 세 칸 · 어디서 눌러 왔나(referrer) · 회원이면 누구 · 브라우저 표식
 * 개인을 특정하는 값은 넣지 않는다(아이피·이름·연락처 없음).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function 자르기(v: unknown, 길이 = 120): string | null {
    if (typeof v !== 'string') return null
    const s = v.trim()
    return s ? s.slice(0, 길이) : null
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()

        // utm 도 referrer 도 없으면 남길 이유가 없다(우리 안에서 돌아다닌 것)
        const source = 자르기(body.utm_source, 60)
        const referrer = 자르기(body.referrer, 200)
        if (!source && !referrer) return NextResponse.json({ ok: true, skipped: true })

        let userId: string | null = null
        try {
            const supabase = await createClient()
            const { data: { user } } = await supabase.auth.getUser()
            userId = user?.id ?? null
        } catch { /* 손님이면 그냥 비운다 */ }

        await createAdminClient().from('visit_logs').insert({
            path: 자르기(body.path, 200),
            utm_source: source,
            utm_medium: 자르기(body.utm_medium, 60),
            utm_campaign: 자르기(body.utm_campaign, 80),
            referrer,
            user_id: userId,
            anon_id: 자르기(body.anon_id, 60),
        })

        return NextResponse.json({ ok: true })
    } catch {
        // 계측이 서비스를 막지 않는다
        return NextResponse.json({ ok: false })
    }
}
