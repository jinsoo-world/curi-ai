// 사용자별 하루 소리 읽기 글자 수 상한 — 유료 음성 비용 폭주 방지.
// DB 함수 tts_charge_chars 가 「상한을 안 넘을 때만 한 번에 올리기」(INSERT ... ON CONFLICT DO UPDATE ... WHERE)를 하므로
// 동시에 여러 요청이 와도 상한을 넘겨 쓸 수 없다(원자적). 함수가 아직 없거나 DB 가 아프면 막지 않고 경고(대화가 멈추는 게 더 큰 사고).
import type { SupabaseClient } from '@supabase/supabase-js'
import { windowStart } from '@/lib/rate-limit'

export const TTS_DAILY_CHARS = 20000

export async function chargeDailyChars(db: SupabaseClient, userId: string, chars: number, limit = TTS_DAILY_CHARS): Promise<{ allowed: boolean }> {
    try {
        const { data, error } = await db.rpc('tts_charge_chars', {
            p_key: `tts-day:u:${userId}`,
            p_window: windowStart(Date.now(), 86400),
            p_chars: chars,
            p_limit: limit,
        })
        if (error) throw error
        return { allowed: data === true }
    } catch (e) {
        console.warn('[tts-quota] 확인 실패, 통과', (e as { code?: string }).code ?? (e instanceof Error ? e.message : e))
        return { allowed: true }
    }
}
