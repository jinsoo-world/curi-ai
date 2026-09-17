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
 * 2026-09-18 = 보내기만 하고 받는 곳이 없었다. PostHog 는 안 붙어 있고 gtag 도 window 에 없었다(실측).
 * 그래서 **우리 표(app_events)에 직접 남기는 길**을 하나 더 냈다. 이게 정본이다.
 * GA·PostHog 로도 계속 보낸다 — 나중에 붙이면 그때부터 같이 쌓인다.
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

/** 이 브라우저를 가리키는 표식 — 누구인지는 모르고, 같은 사람인지만 안다 */
function 표식(): string {
    try {
        let v = localStorage.getItem('curi_anon') || ''
        if (!v) { v = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('curi_anon', v) }
        return v
    } catch { return '' }
}

export function 센다(사건: 사진사건, 값들: 값 = {}) {
    // ① 우리 표에 남긴다(정본)
    try {
        const { tool, ...나머지 } = 값들 as Record<string, unknown>
        void fetch('/api/track/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,   // 화면을 떠나도 끝까지 보낸다
            body: JSON.stringify({
                name: 사건,
                tool: typeof tool === 'string' ? tool : null,
                path: typeof location !== 'undefined' ? location.pathname : null,
                anon_id: 표식(),
                extra: Object.keys(나머지).length ? 나머지 : null,
            }),
        }).catch(() => { /* 계측이 서비스를 막지 않는다 */ })
    } catch { /* 같은 이유 */ }

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
