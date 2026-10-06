// 사용자별 하루 소리 읽기 글자 수 상한 — 유료 음성 비용 폭주 방지.
// rate_limits 표를 글자 수만큼 올려 센다(요청 횟수 제한과 같은 표, 같은 방식: 표가 아프면 막지 않고 경고).
import type { SupabaseClient } from '@supabase/supabase-js'
import { windowStart } from '@/lib/rate-limit'

export const TTS_DAILY_CHARS = 20000

export async function chargeDailyChars(db: SupabaseClient, userId: string, chars: number, limit = TTS_DAILY_CHARS): Promise<{ allowed: boolean }> {
    const key = `tts-day:u:${userId}`
    const ws = windowStart(Date.now(), 86400)
    try {
        const { data, error } = await db.from('rate_limits').select('count').eq('key', key).eq('window_start', ws).maybeSingle()
        if (error) throw error
        const used = (data as { count: number } | null)?.count ?? 0
        if (used + chars > limit) return { allowed: false }
        const { error: upErr } = await db.from('rate_limits').upsert({ key, window_start: ws, count: used + chars }, { onConflict: 'key,window_start' })
        if (upErr) throw upErr
        return { allowed: true }
    } catch (e) {
        console.warn('[tts-quota] 확인 실패, 통과', (e as { code?: string }).code ?? (e instanceof Error ? e.message : e))
        return { allowed: true }
    }
}
