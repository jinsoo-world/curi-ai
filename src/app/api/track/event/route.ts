/**
 * 고객이 무엇을 했는지 한 줄 남긴다 — 대표 지적 2026-09-18 「고객이 들어와서 어떤 행동을 하는지 확인이 안돼」
 *
 * 왜 =  화면에서 부르던 센다() 는 PostHog 와 gtag 로 보내고 있었는데 둘 다 살아 있지 않았다
 *       (PostHog 는 안 붙어 있고, gtag 는 window 에 없다 — 2026-09-17 실측).
 *       그래서 사진 올림·만들기·성공·내려받기가 어디에도 안 남았다. 우리 표에 직접 남긴다.
 *
 * 남기는 것 = 언제 · 무슨 행동 · 어느 도구 · 어느 화면 · 회원이면 누구 · 브라우저 표식
 * 안 남기는 것 = 사진 자체, 이름·연락처 같은 개인정보
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** 우리가 세는 행동만 받는다. 모르는 이름이 쌓여 표가 쓰레기가 되는 것을 막는다 */
const 아는행동 = new Set([
    'photo_upload',        // 사진 올림
    'photo_make_click',    // 만들기 누름
    'photo_make_success',  // 사진 나옴
    'photo_make_fail',     // 실패
    'photo_download',      // 내려받기
    'photo_login_prompt',  // 로그인하라고 띄움
    'photo_share',         // 공유 누름
    'charge_open',         // 충전 창 열기
])

function 자르기(v: unknown, n = 80): string | null {
    if (typeof v !== 'string') return null
    const s = v.trim()
    return s ? s.slice(0, n) : null
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const name = 자르기(body.name, 40)
        if (!name || !아는행동.has(name)) return NextResponse.json({ ok: true, skipped: true })

        let userId: string | null = null
        try {
            const supabase = await createClient()
            const { data: { user } } = await supabase.auth.getUser()
            userId = user?.id ?? null
        } catch { /* 손님이면 비운다 */ }

        const { error } = await createAdminClient().from('app_events').insert({
            name,
            tool: 자르기(body.tool, 40),
            path: 자르기(body.path, 120),
            user_id: userId,
            anon_id: 자르기(body.anon_id, 60),
            extra: body.extra && typeof body.extra === 'object' ? body.extra : null,
        })

        if (error) return NextResponse.json({ ok: false, why: error.message })
        return NextResponse.json({ ok: true })
    } catch (e) {
        return NextResponse.json({ ok: false, why: e instanceof Error ? e.message : 'unknown' })
    }
}
