// 스모크 시험 공용 도구. 콘솔 오류를 「우리 코드 기준」으로만 모은다.
import type { Page, TestInfo } from '@playwright/test'

/** 시연 팀 첫 봇(오재현)의 공개 봇 id. src/components/os/OsShell.tsx DEMO_TEAM 과 같은 값 */
export const DEMO_FIRST_BOT_ID = '118bef35-26bc-4118-a446-aa96e977f9ee'

/** 우리 잘못이 아닌 소음. 광고·계측·서드파티 주소는 오류로 세지 않는다 */
const THIRD_PARTY = /posthog|clarity\.ms|googletagmanager|google-analytics|doubleclick|facebook|connect\.facebook|kakao|t\.kakaocdn|vercel-insights|_vercel\/insights|_vercel\/speed-insights|va\.vercel-scripts|analytics|gstatic|googleapis|sentry/i

/** 브라우저 쪽 메시지 중 무시하는 문구(서드파티가 찍는 흔한 것) */
const IGNORE_TEXT = [
    /Failed to load resource: the server responded with a status of 404/i, // 아래에서 같은 출처인지 따로 본다
    /ServiceWorker.*Uncontrolled|The FetchEvent for .* resulted in a network error/i, // 오프라인 캐시 놓친 것
    /Third-party cookie/i,
    /was preloaded using link preload but not used/i,
]

export interface ConsoleWatch {
    /** 우리 코드로 보이는 오류만 */
    errors: string[]
    /** 참고용: 걸러낸 소음 */
    ignored: string[]
}

/**
 * 페이지에 붙여 콘솔 오류와 스크립트 예외를 모은다.
 * - pageerror(스크립트 예외)는 전부 센다
 * - console.error 는 같은 출처(우리 서버)에서 난 것만 센다. 404 도 우리 주소면 센다
 */
export function watchConsole(page: Page, baseURL: string): ConsoleWatch {
    const ours = new URL(baseURL).host
    const watch: ConsoleWatch = { errors: [], ignored: [] }
    page.on('pageerror', err => { watch.errors.push(`[예외] ${err.message}`) })
    page.on('console', msg => {
        if (msg.type() !== 'error') return
        const text = msg.text()
        const url = msg.location()?.url || ''
        let host = ''
        try { host = url ? new URL(url).host : '' } catch { host = '' }
        const thirdParty = (host && host !== ours) || THIRD_PARTY.test(url) || THIRD_PARTY.test(text)
        if (thirdParty) { watch.ignored.push(`${text} @ ${url}`); return }
        // 같은 출처인데 404 면 우리 파일이 빠진 것 = 오류로 센다. 출처를 모르는 404 는 소음으로 둔다
        const is404 = IGNORE_TEXT[0].test(text)
        if (is404 && !host) { watch.ignored.push(`${text} @ (출처 모름)`); return }
        if (!is404 && IGNORE_TEXT.slice(1).some(re => re.test(text))) { watch.ignored.push(text); return }
        watch.errors.push(`${text}${url ? ` @ ${url}` : ''}`)
    })
    return watch
}

/** 걸러낸 소음을 결과 보고서에 붙인다(실패 원인을 읽을 때 참고) */
export function attachIgnored(testInfo: TestInfo, watch: ConsoleWatch) {
    if (watch.ignored.length) testInfo.annotations.push({ type: '걸러낸 서드파티 메시지', description: String(watch.ignored.length) + '건' })
}

/** 페이지가 「다 그려졌다」고 볼 때까지 잠깐 기다린다(스트림·리다이렉트 포함) */
export async function settle(page: Page) {
    await page.waitForLoadState('domcontentloaded')
    await page.waitForLoadState('networkidle').catch(() => { /* 계측 핑이 계속 나가도 넘어간다 */ })
}
