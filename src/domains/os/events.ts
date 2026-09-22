'use client'
// domains/os — 에이전트 OS 화면에서 세는 8개 (AARRR).
//
// 왜 8개뿐인가 = 세는 자리가 많으면 아무도 안 본다. 손님이 「와서 → 봇을 만들고 → 말을 걸고 →
// 승인하고 → 매일 들르고 → 반복(루틴)을 켜고 → 자료를 넣는」 길만 센다.
//
//   획득(A) os_view          누가 이 화면에 왔나
//   활성(A) os_bot_created   봇을 만들었나            ← 첫 성공
//   활성(A) os_message_sent  말을 걸었나
//   활성(A) os_approval_shown / os_approval_decided  승인 카드를 보고 답했나
//   유지(R) os_checkin_done  오늘 체크인을 했나
//   유지(R) os_routine_created 반복을 켰나            ← 다시 오는 가장 센 신호
//   수익(R) os_knowledge_added 자기 자료를 넣었나     ← 갈아타기 어려워지는 지점
//
// ⛔ 개인정보는 절대 넣지 않는다. 이름·전화·메시지 본문·자료 제목 금지. ID 와 개수만.

import posthog from 'posthog-js'

export type OsEvent =
    | 'os_view'
    | 'os_bot_created'
    | 'os_message_sent'
    | 'os_approval_shown'
    | 'os_approval_decided'
    | 'os_checkin_done'
    | 'os_routine_created'
    | 'os_knowledge_added'

/** 붙여도 되는 값 = 숫자·참거짓·짧은 갈래 이름·ID. 본문·이름은 안 된다 */
export type OsEventProps = Record<string, string | number | boolean | null | undefined>

export function osTrack(event: OsEvent, props: OsEventProps = {}): void {
    try {
        if (posthog.__loaded) posthog.capture(event, props)
    } catch {
        // 계측이 서비스를 막지 않는다. 조용히 넘어간다.
    }
}
