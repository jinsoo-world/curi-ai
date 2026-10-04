// 대화방 번호 없이 들어온 로그인 회원의 말도 사용량에 잡히게, 서버가 대화방을 새로 만든다 (2026-10-05).
// 월간 한도는 chat_sessions 에 저장된 사용자 말 수로 센다(domains/os/usage-db). 대화방이 없으면 말이 저장되지 않아 한도를 피할 수 있었다.
import type { SupabaseClient } from '@supabase/supabase-js'

/** 새 대화방 번호. 만들지 못하면 null (부른 쪽이 답을 막는다) */
export async function createServerSession(db: SupabaseClient, userId: string, mentorId: string, firstMessage: string): Promise<string | null> {
    try {
        const title = String(firstMessage ?? '').replace(/\s+/g, ' ').trim().slice(0, 30) || '새 대화'
        const { data, error } = await db.from('chat_sessions')
            .insert({ user_id: userId, mentor_id: mentorId, title })
            .select('id').single()
        if (error || !data) {
            console.error('[chat] 대화방 자동 생성 실패:', error?.message ?? 'no data')
            return null
        }
        return (data as { id: string }).id
    } catch (e) {
        console.error('[chat] 대화방 자동 생성 오류:', e instanceof Error ? e.message : e)
        return null
    }
}
