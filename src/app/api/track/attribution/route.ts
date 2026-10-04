/**
 * 처음 들어온 길을 가입한 사람에게 잇는다 — 대표 지시 2026-10-05 「어디서 온 사람이 가입하고 결제하나」
 *
 * 브라우저가 처음 들어온 순간 적어 둔 것(utm, referrer, 추천 코드, 기기)을 로그인한 뒤 한 번 보내 온다.
 * 가입 온보딩 줄(user_onboarding)에 「비어 있을 때만」 채운다. 한 번 채워진 줄(first_touch_at)은 다시 덮지 않는다.
 * 온보딩 줄이 없는 옛 회원은 아무것도 하지 않는다(기록 전에 가입한 사람).
 * 손님이면 200 으로 돌려보낸다(오류 소음을 만들지 않는다). 개인정보(이름, 연락처, 아이피)는 받지도 남기지도 않는다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeFirstTouch } from '@/domains/acquisition/first-touch-input'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({})) as Record<string, unknown>
        let userId: string | null = null
        try {
            const supabase = await createClient()
            const { data: { user } } = await supabase.auth.getUser()
            userId = user?.id ?? null
        } catch { /* 손님 */ }
        if (!userId) return NextResponse.json({ ok: true, guest: true })

        const ft = sanitizeFirstTouch(body.first_touch, req.headers.get('user-agent'))
        if (!ft) return NextResponse.json({ ok: true, done: true, linked: false, reason: 'empty' })

        const db = createAdminClient()
        const { data: row, error: readErr } = await db.from('user_onboarding').select('user_id, first_touch_at').eq('user_id', userId).maybeSingle()
        if (readErr) return NextResponse.json({ ok: false, why: readErr.message })
        // 온보딩 줄이 없다 = 기록을 시작하기 전에 가입한 사람. 다시 부르지 않게 done
        if (!row) return NextResponse.json({ ok: true, done: true, linked: false, reason: 'no_row' })
        if (row.first_touch_at) return NextResponse.json({ ok: true, done: true, linked: false, reason: 'already' })

        const cut = (v: unknown, n: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n).replace(/[^0-9A-Za-z_-]/g, '') : null)
        const { data: upd, error } = await db.from('user_onboarding')
            .update({
                utm_source: ft.utm_source, utm_medium: ft.utm_medium, utm_campaign: ft.utm_campaign,
                referrer: ft.referrer, ref_code: ft.ref_code, landing_path: ft.landing_path,
                device: ft.device, os: ft.os, app_shell: ft.app_shell,
                visitor_id: cut(body.visitorId, 60),
                first_touch_at: ft.at,
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId).is('first_touch_at', null).select('user_id')
        if (error) return NextResponse.json({ ok: false, why: error.message })
        return NextResponse.json({ ok: true, done: true, linked: (upd ?? []).length > 0 })
    } catch (e) {
        return NextResponse.json({ ok: false, why: e instanceof Error ? e.message : 'unknown' })
    }
}
