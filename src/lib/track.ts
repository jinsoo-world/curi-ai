/**
 * 사진 도구에서 무슨 일이 일어나는지 센다 — 전수조사 1번
 *
 * 대표 지적 2026-09-15 = 「전수조사하고 더 개선해야 할 거 30가지」 중 1순위.
 * 지금까지 사진 도구 6개에 기록이 한 개도 없었다. 몇 명이 사진을 올리고
 * 어디서 그만두는지 아무도 몰랐고, 광고를 켜도 판정을 못 했다.
 *
 * 세는 자리는 여섯 곳이다. 이 여섯 개면 「올림 → 만들기 → 성공 → 받기」가 다 이어진다.
 *   올림 / 만들기누름 / 성공 / 실패 / 내려받기 / 로그인유도 (+ 공유)
 *
 * GA 와 PostHog 둘 다에 같은 이름으로 보낸다. 둘이 다르면 나중에 대조를 못 한다.
 */
import posthog from 'posthog-js'

type 값 = Record<string, string | number | boolean | null | undefined>

export type 사진사건 =
    | 'photo_upload'
    | 'photo_make_click'
    | 'photo_make_success'
    | 'photo_make_fail'
    | 'photo_download'
    | 'photo_login_prompt'
    | 'photo_share'

export function 센다(사건: 사진사건, 값들: 값 = {}) {
    try {
        if (posthog.__loaded) posthog.capture(사건, 값들)
    } catch {
        // 계측이 서비스를 막으면 안 된다. 조용히 넘어간다.
    }
    try {
        ;(window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.('event', 사건, 값들)
    } catch {
        // 같은 이유
    }
}
