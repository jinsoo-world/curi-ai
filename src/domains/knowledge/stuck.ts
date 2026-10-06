// 「읽는 중」으로 영영 남은 자료를 「못 읽음(시간 초과)」으로 바꾼다 (지우지 않는다). 정리 작업(cron/retention-purge)이 하루 한 번 부른다.
// 학습 창구는 최대 300초라, 시작(processing_started_at, 없으면 만든 시각)에서 30분이 지났는데 아직 pending/processing 이면
// 함수가 중간에 끊긴 것이다. 화면은 「못 읽음 + 다시 시도」를 보여 준다.
import type { SupabaseClient } from '@supabase/supabase-js'
import { FAIL_REASON_COL } from './actions'

export const STUCK_AFTER_MS = 30 * 60_000

const COLUMN_MISSING = new Set(['42703', 'PGRST204'])

export async function failStuckSources(db: SupabaseClient, now: Date = new Date()): Promise<number> {
    const cut = new Date(now.getTime() - STUCK_AFTER_MS).toISOString()
    const base = () => db.from('knowledge_sources')
        .update({ processing_status: 'failed', [FAIL_REASON_COL]: 'timeout' })
        .in('processing_status', ['pending', 'processing'])
        .lt('created_at', cut)
    let r = await base().or(`processing_started_at.is.null,processing_started_at.lt."${cut}"`).select('id')
    if (r.error && COLUMN_MISSING.has(r.error.code ?? '')) {
        // processing_started_at 칸이 아직 없으면(마이그레이션 전) 만든 시각만 본다
        r = await base().select('id')
    }
    if (r.error) throw new Error(`[knowledge/stuck] ${r.error.message}`)
    return (r.data ?? []).length
}
