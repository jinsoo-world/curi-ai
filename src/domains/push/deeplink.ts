// domains/push — 알림을 누르면 갈 곳. 아이폰·안드로이드 앱이 같은 약속을 따른다 (2026-10-02).
//
// ── 앱과의 약속 ─────────────────────────────────────────────
//   알림에 실리는 칸 (애플은 aps 옆 같은 높이, 구글은 data 칸. 값은 전부 글자)
//     sendId    push_sends.id. 앱이 눌렸을 때 POST /api/push/opened { sendId } 로 돌려준다
//     type      알림 종류 번호 (P001 등, 설계서 02_제품/큐리스/큐리AI_앱푸시_100종_설계_1002.md)
//     deeplink  갈 곳. 아래 셋 중 하나
//       curiai://bot/{mentorId}    그 봇 대화방
//       curiai://group/{channelId} 그 단체방
//       curiai://home              앱 첫 화면 (갈 곳을 모를 때)
//     mentorId  (애플만, 예전 앱 호환) deeplink 가 bot 일 때 그 봇 번호
// ────────────────────────────────────────────────────────────

export const DEEPLINK_HOME = 'curiai://home'

export const deeplinkBot = (mentorId: string) => `curiai://bot/${encodeURIComponent(mentorId)}`
export const deeplinkGroup = (channelId: string) => `curiai://group/${encodeURIComponent(channelId)}`

/** curiai://bot/{id} 에서 봇 번호. 아니면 null */
export function mentorIdOf(deeplink: string | null | undefined): string | null {
    const m = /^curiai:\/\/bot\/([^/?#]+)/.exec(deeplink ?? '')
    return m ? decodeURIComponent(m[1]) : null
}
