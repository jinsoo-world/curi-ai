// domains/os — 봇이 하나 생길 때마다 「봇 만듦」 기록을 딱 한 줄 남긴다 (서버에서만).
//
// 왜 = 화면(posthog-js)에서만 세서 9월에 DB 봇 49개인데 기록은 4개였다.
//      봇이 생기는 자리(mentors 에 넣는 곳)는 두 군데뿐이라, 거기서 바로 우리 표(app_events)에 남긴다.
//      화면 쪽 osTrack 은 PostHog 로만 가고 app_events 에는 안 쓰니 겹쳐 세지 않는다.
// 기록이 실패해도 봇 만들기는 막지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'

/** 어느 길로 만들었나 */
export type BotCreatedPath =
    | 'os_new_bot'      // /os 「＋ 개인봇」
    | 'twin_draft'      // /home SNS 링크로 만든 분신 초안
    | 'onboarding'      // /os/start 첫 팀 자동 만들기
    | 'creator_create'  // 옛 /creator/create
    | 'deep_create'     // 깊게 만들기 (구독 전용, 10/7)

export async function recordBotCreated(
    db: SupabaseClient,
    e: { path: BotCreatedPath; mentorId: string; userId: string },
): Promise<void> {
    try {
        const { error } = await db.from('app_events').insert({
            name: 'os_bot_created',
            tool: e.path,
            path: null,
            user_id: e.userId,
            anon_id: null,
            extra: { path: e.path, mentor_id: e.mentorId, user_id: e.userId },
        })
        if (error) console.error('[os_bot_created] 기록 실패', error.message)
    } catch (err) {
        console.error('[os_bot_created] 기록 실패', err instanceof Error ? err.message : err)
    }
}

/** 「내 링크로 만들기」 초안 기록 (시작, 성공, 실패). 실패해도 막지 않는다 */
export async function recordDraftEvent(
    db: SupabaseClient,
    e: { name: 'draft_started' | 'draft_succeeded' | 'draft_failed'; userId: string; extra: Record<string, unknown> },
): Promise<void> {
    try {
        const { error } = await db.from('app_events').insert({
            name: e.name, tool: 'twin_draft', path: '/api/os/twin-draft', user_id: e.userId, anon_id: null, extra: e.extra,
        })
        if (error) console.error(`[${e.name}] 기록 실패`, error.message)
    } catch (err) {
        console.error(`[${e.name}] 기록 실패`, err instanceof Error ? err.message : err)
    }
}
