// 명단 화면의 「마지막 말 한 줄」.
// DB 함수(last_messages_for_sessions / last_messages_for_channels)가 방마다 마지막 말 1건을 한 번에 돌려준다.
// 함수가 아직 없거나 실패해도 목록 자체는 나가야 하므로 빈 결과로 물러난다(하위 호환).
import type { SupabaseClient } from '@supabase/supabase-js'

export const PREVIEW_MAX = 60

export interface LastMessage { preview: string | null; at: string | null }

/** 앞 60자, 줄바꿈은 공백. 없으면 null */
export function makePreview(text: string | null | undefined): string | null {
    const t = (text ?? '').replace(/\s+/g, ' ').trim()
    return t ? t.slice(0, PREVIEW_MAX) : null
}

/** id → 마지막 말. 말이 없는 id 는 결과에 없다 */
export async function fetchLastMessages(
    db: SupabaseClient, kind: 'session' | 'channel', ids: string[],
): Promise<Record<string, LastMessage>> {
    if (ids.length === 0) return {}
    const fn = kind === 'session' ? 'last_messages_for_sessions' : 'last_messages_for_channels'
    const { data, error } = await db.rpc(fn, { p_ids: ids })
    if (error) {
        console.error(`[last-message-preview] ${fn}`, error.code ?? '', error.message)
        return {}
    }
    const out: Record<string, LastMessage> = {}
    for (const r of (data ?? []) as { owner_id: string; content: string | null; created_at: string | null }[]) {
        out[r.owner_id] = { preview: makePreview(r.content), at: r.created_at ?? null }
    }
    return out
}
