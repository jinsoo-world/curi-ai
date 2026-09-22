// 요청 횟수 제한 — 보안 설계 C-1 9번. Supabase 표(rate_limits) 카운트로 한다(유료 Upstash 안 씀).
//
// 열쇠(key) 하나가 windowSec 동안 limit 번까지. 예) chat:사용자id 분당 20.
// 표가 없거나 DB 가 잠깐 아프면 막지 않고 경고만 남긴다(대화가 통째로 멈추는 게 더 큰 사고).

import type { SupabaseClient } from '@supabase/supabase-js'

export interface RateLimitResult {
    allowed: boolean
    remaining: number
}

/** 창 시작 시각 = windowSec 단위로 내림 (ISO) */
export function windowStart(nowMs: number, windowSec: number): string {
    const w = windowSec * 1000
    return new Date(Math.floor(nowMs / w) * w).toISOString()
}

export async function checkRateLimit(db: SupabaseClient, key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
    const ws = windowStart(Date.now(), windowSec)
    try {
        const { data, error } = await db
            .from('rate_limits')
            .select('count')
            .eq('key', key)
            .eq('window_start', ws)
            .maybeSingle()
        if (error) throw error
        const count = (data as { count: number } | null)?.count ?? 0
        if (count >= limit) return { allowed: false, remaining: 0 }

        const { error: upErr } = await db
            .from('rate_limits')
            .upsert({ key, window_start: ws, count: count + 1 }, { onConflict: 'key,window_start' })
        if (upErr) throw upErr
        return { allowed: true, remaining: limit - count - 1 }
    } catch (e) {
        const code = (e as { code?: string }).code
        console.warn(code === '42P01' ? '[rate-limit] rate_limits 표가 아직 없어 제한 없이 통과' : '[rate-limit] 확인 실패, 통과', code ?? (e instanceof Error ? e.message : e))
        return { allowed: true, remaining: limit }
    }
}

/** 넘었을 때 돌려줄 한국어 안내 (429) */
export function rateLimitMessage(what = '요청'): string {
    return `${what}이 너무 잦아요. 잠시 쉬었다가 다시 해 주세요.`
}

/** 라우트에서 쓰는 열쇠: 로그인했으면 사용자 id, 아니면 방문자 id, 그것도 없으면 IP */
export function rateLimitKey(prefix: string, userId?: string | null, visitorId?: string | null, req?: Request): string {
    if (userId) return `${prefix}:u:${userId}`
    if (visitorId && typeof visitorId === 'string') return `${prefix}:v:${visitorId.slice(0, 64)}`
    const ip = req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req?.headers.get('x-real-ip') || 'unknown'
    return `${prefix}:ip:${ip}`
}
