// 라이브 스모크 시험 설정. 배포 뒤 「사람이 안 보고도 깨진 걸 아는」 용도.
// 대상 주소 = SMOKE_BASE (기본 https://www.curi-ai.com). 읽기만 한다. 돈·발송·저장을 일으키지 않는다.
// 돌리기: npx playwright test        (자세한 설명 docs/qa/스모크_시험.md)
import { defineConfig } from '@playwright/test'

const baseURL = (process.env.SMOKE_BASE || 'https://www.curi-ai.com').replace(/\/$/, '')

export default defineConfig({
    testDir: './tests/smoke',
    timeout: 60_000,                 // 시험 하나에 60초
    expect: { timeout: 10_000 },
    fullyParallel: true,
    retries: process.env.CI ? 1 : 0, // 깃허브에서는 한 번 더 시도(네트워크 흔들림 구분)
    reporter: process.env.CI
        ? [['list'], ['html', { open: 'never' }], ['github']]
        : [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        video: 'off',
        locale: 'ko-KR',
        timezoneId: 'Asia/Seoul',
    },
    projects: [
        // 폰 (아이폰 크기). 손님 대부분이 폰으로 온다
        // API·열쇠 검사는 화면 크기와 무관해 desktop 에서만 돈다
        { name: 'phone', testIgnore: ['**/api.spec.ts', '**/secrets.spec.ts'], use: { browserName: 'chromium', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
        // 데스크톱
        { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
    ],
})
