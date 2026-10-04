/**
 * 어디서 들어왔는지 한 줄 남긴다 — 대표 지시 2026-09-17 「1,2 둘다」
 *
 * 왜 =  공유 링크에는 utm(어디서 눌렀는지)이 붙는데 그걸 받아 적는 곳이 없었다.
 *       그래서 카톡방에 뿌린 링크로 몇 명이 왔는지 셀 수가 없었다(2026-09-16 실측: GTM 은 ID 가 비어 껍데기).
 *
 * 무엇을 남기나 = 언제 · 어느 화면 · utm 세 칸 · 어디서 눌러 왔나(referrer) · 추천 코드 · 기기와 앱 여부 · 회원이면 누구 · 브라우저 표식
 * 2026-10-05: 직접 들어온 방문도 남긴다(광고비 판단용). 검색 로봇 같은 사람 아닌 방문은 거른다.
 * 개인을 특정하는 값은 넣지 않는다(아이피·이름·연락처 없음).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { detectClientContext } from '@/domains/os/onboarding'
import { isAuthReturn, looksLikeBot } from '@/domains/acquisition/labels'

export const dynamic = 'force-dynamic'

function 자르기(v: unknown, 길이 = 120): string | null {
    if (typeof v !== 'string') return null
    const s = v.trim()
    return s ? s.slice(0, 길이) : null
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()

        // 사람 아닌 방문(검색 로봇, 점검 도구)은 남기지 않는다
        const ua = req.headers.get('user-agent')
        if (looksLikeBot(ua)) return NextResponse.json({ ok: true, skipped: 'bot' })

        const source = 자르기(body.utm_source, 60)
        const referrer = 자르기(body.referrer, 200)
        // 로그인하러 갔다 돌아온 것은 유입이 아니다
        if (!source && isAuthReturn(referrer)) return NextResponse.json({ ok: true, skipped: 'auth' })
        // 기기는 서버가 브라우저 정보에서 가른다. 앱 껍데기만 화면이 알려 준 값을 믿는다
        const ctx = detectClientContext(ua || '', body.app_shell === 'ios_app' ? 'ios' : body.app_shell === 'android_app' ? 'android' : null)

        let userId: string | null = null
        try {
            const supabase = await createClient()
            const { data: { user } } = await supabase.auth.getUser()
            userId = user?.id ?? null
        } catch { /* 손님이면 그냥 비운다 */ }

        const base = {
            path: 자르기(body.path, 200),
            utm_source: source,
            utm_medium: 자르기(body.utm_medium, 60),
            utm_campaign: 자르기(body.utm_campaign, 80),
            referrer,
            user_id: userId,
            anon_id: 자르기(body.anon_id, 60),
        }
        const admin = createAdminClient()
        let { error } = await admin.from('visit_logs').insert({
            ...base,
            device: ctx.device,
            os: ctx.os,
            app_shell: ctx.app_shell,
            ref_code: 자르기(body.ref_code, 40),
            visitor_id: 자르기(body.visitor_id, 60),
        })
        // 새 칸이 아직 없는 DB(42703, PGRST204)면 예전 칸만으로 한 번 더 — 방문 기록을 잃지 않는다
        if (error && ['42703', 'PGRST204'].includes((error as { code?: string }).code ?? '')) {
            ;({ error } = await admin.from('visit_logs').insert(base))
        }

        // 왜 안 들어갔는지 삼키지 않는다 — 2026-09-17 에 이걸 삼켜서 원인을 한참 찾았다
        if (error) return NextResponse.json({ ok: false, why: error.message })
        return NextResponse.json({ ok: true })
    } catch (e) {
        // 계측이 서비스를 막지 않는다
        return NextResponse.json({ ok: false, why: e instanceof Error ? e.message : 'unknown' })
    }
}
