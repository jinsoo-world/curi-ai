/**
 * 어디서 몇 명이 들어왔나 — 관리자용 집계 (대표 지시 2026-09-17)
 *
 * 방문(visit_logs)과 그 뒤에 일어난 일(가입·사진)을 같은 창에서 본다.
 * 사람 수는 브라우저 표식(anon_id)으로 센다. 표식이 없으면 한 줄을 한 사람으로 본다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-guard'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
    await requireAdmin()

    const 일수 = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get('days') ?? 7)))
    const 부터 = new Date(Date.now() - 일수 * 86400_000).toISOString()
    const admin = createAdminClient()

    const { data: 방문 } = await admin
        .from('visit_logs')
        .select('created_at, path, utm_source, utm_medium, utm_campaign, referrer, user_id, anon_id')
        .gte('created_at', 부터)
        .order('created_at', { ascending: false })
        .limit(2000)

    const 줄 = 방문 ?? []

    // 어디서 왔나로 묶는다
    const 묶음 = new Map<string, { 이름: string; 방문: number; 사람: Set<string>; 회원: Set<string>; 최근: string }>()
    for (const r of 줄) {
        const 이름 = r.utm_source
            ? `${r.utm_source}${r.utm_campaign ? ` · ${r.utm_campaign}` : ''}`
            : (r.referrer ? new URL(r.referrer).hostname.replace(/^www\./, '') : '직접')
        if (!묶음.has(이름)) 묶음.set(이름, { 이름, 방문: 0, 사람: new Set(), 회원: new Set(), 최근: r.created_at })
        const g = 묶음.get(이름)!
        g.방문 += 1
        g.사람.add(r.anon_id || r.created_at)
        if (r.user_id) g.회원.add(r.user_id)
        if (r.created_at > g.최근) g.최근 = r.created_at
    }

    const 들어온길 = [...묶음.values()]
        .map((g) => ({ 이름: g.이름, 방문: g.방문, 사람: g.사람.size, 회원: g.회원.size, 최근: g.최근 }))
        .sort((a, b) => b.사람 - a.사람)

    // 같은 기간에 실제로 일어난 일
    const [{ count: 가입 }, { count: 사진 }] = await Promise.all([
        admin.from('users').select('id', { count: 'exact', head: true }).gte('created_at', 부터),
        admin.from('tool_photos').select('id', { count: 'exact', head: true }).gte('created_at', 부터),
    ])

    return NextResponse.json({
        일수,
        들어온길,
        최근: 줄.slice(0, 50),
        같은기간: { 가입: 가입 ?? 0, 사진: 사진 ?? 0 },
    })
}
