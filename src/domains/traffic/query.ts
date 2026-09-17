/**
 * 들어온 길 집계 — 화면(서버)과 창구(API)가 같은 함수를 쓴다
 *
 * 대표 지적 2026-09-17 「그 화면 10초 걸리는거 고쳐줘」
 * 전에는 화면이 다 뜬 **뒤에야** 브라우저가 창구를 부르기 시작했다. 그래서 회색 글자가 오래 남았다.
 * 이제 서버가 첫 화면을 그릴 때 숫자를 이미 담아 보낸다. 기간을 바꿀 때만 창구를 부른다.
 */
import { createAdminClient } from '@/lib/supabase/admin'

export interface 들어온길 { 이름: string; 방문: number; 사람: number; 회원: number; 최근: string }
export interface 최근줄 {
    created_at: string
    path: string | null
    utm_source: string | null
    utm_campaign: string | null
    referrer: string | null
    user_id: string | null
}
export interface 유입자료 {
    일수: number
    들어온길: 들어온길[]
    최근: 최근줄[]
    같은기간: { 가입: number; 사진: number }
}

function 길이름(r: { utm_source: string | null; utm_campaign: string | null; referrer: string | null }) {
    if (r.utm_source) return `${r.utm_source}${r.utm_campaign ? ` · ${r.utm_campaign}` : ''}`
    if (!r.referrer) return '직접'
    try { return new URL(r.referrer).hostname.replace(/^www\./, '') } catch { return '직접' }
}

export async function 유입세기(일수: number): Promise<유입자료> {
    const 기간 = Math.min(90, Math.max(1, Number(일수) || 7))
    const 부터 = new Date(Date.now() - 기간 * 86400_000).toISOString()
    const admin = createAdminClient()

    const [방문, 가입수, 사진수] = await Promise.all([
        admin.from('visit_logs')
            .select('created_at, path, utm_source, utm_medium, utm_campaign, referrer, user_id, anon_id')
            .gte('created_at', 부터).order('created_at', { ascending: false }).limit(2000),
        admin.from('users').select('id', { count: 'exact', head: true }).gte('created_at', 부터),
        admin.from('tool_photos').select('id', { count: 'exact', head: true }).gte('created_at', 부터),
    ])

    const 줄 = 방문.data ?? []
    const 묶음 = new Map<string, { 이름: string; 방문: number; 사람: Set<string>; 회원: Set<string>; 최근: string }>()
    for (const r of 줄) {
        const 이름 = 길이름(r)
        if (!묶음.has(이름)) 묶음.set(이름, { 이름, 방문: 0, 사람: new Set(), 회원: new Set(), 최근: r.created_at })
        const g = 묶음.get(이름)!
        g.방문 += 1
        g.사람.add(r.anon_id || r.created_at)
        if (r.user_id) g.회원.add(r.user_id)
        if (r.created_at > g.최근) g.최근 = r.created_at
    }

    return {
        일수: 기간,
        들어온길: [...묶음.values()]
            .map((g) => ({ 이름: g.이름, 방문: g.방문, 사람: g.사람.size, 회원: g.회원.size, 최근: g.최근 }))
            .sort((a, b) => b.사람 - a.사람),
        최근: 줄.slice(0, 50) as 최근줄[],
        같은기간: { 가입: 가입수.count ?? 0, 사진: 사진수.count ?? 0 },
    }
}
