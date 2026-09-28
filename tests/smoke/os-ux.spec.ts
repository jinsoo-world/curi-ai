// 대표 승인 0928 사용성 10개 스모크. 읽기만 한다: 대화, 세션, 연결 응답은 이 시험 안에서만 가짜로 바꾼다(서버, 저장 안 건드림).
import { test, expect, type Page } from '@playwright/test'
import { settle } from './helpers'

// 시연 팀 첫 봇(기획팀장) mentorId = OsShell DEMO_TEAM
const PLANNING = '9fc9b3fa-1721-40c6-bc4e-1b544c117483'
const isPhone = (name: string) => name === 'phone'

async function mockChatBlocked(page: Page) {
    const sse = `data: ${JSON.stringify({ text: '로그인하면 대화할 수 있어요', done: true, fullResponse: '로그인하면 대화할 수 있어요', audienceBlocked: true, audienceReason: 'login_required' })}\n\n`
    await page.route('**/api/chat', r => r.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sse }))
    await page.route('**/api/sessions**', r => r.fulfill({ json: { sessions: [], session: null } }))
    await page.route('**/api/os/chat/draft', r => r.fulfill({ json: {} }))
}

test('1, 5, 6, 9: 시연 대화 = 추천 질문 3개, 머리 단추 2개 구분, 짧은 입력 안내, 막히면 로그인 단추', async ({ page }, info) => {
    await mockChatBlocked(page)
    await page.goto(`/os/chat/${PLANNING}?demo=1`, { waitUntil: 'domcontentloaded' })
    await settle(page)

    // 6. 오른쪽 = 정보(ⓘ), 폰 왼쪽 = 명단. 둘 다 44px 이상
    const info_ = page.getByRole('button', { name: '세부 정보 열기' })
    await expect(info_).toContainText('정보')
    const ib = await info_.boundingBox()
    expect(ib!.height).toBeGreaterThanOrEqual(44)
    expect(ib!.width).toBeGreaterThanOrEqual(44)
    if (isPhone(info.project.name)) {
        const nav = page.locator('.os-chat-head').getByRole('button', { name: '봇 명단 열기' })
        await expect(nav).toContainText('명단')
        const nb = await nav.boundingBox()
        expect(nb!.height).toBeGreaterThanOrEqual(44)
    }

    // 9. 폰 입력 안내 = 「기획팀장에게 물어보세요」 (@ 안내 없음)
    const input = page.locator('.os-input')
    const ph = await input.getAttribute('placeholder')
    if (isPhone(info.project.name)) expect(ph).toBe('기획팀장에게 물어보세요')
    else expect(ph).toContain('기획팀장에게 물어보세요')

    // 5. 추천 질문 3개
    const chips = page.locator('.os-first-tasks .os-chipbtn')
    await expect(chips).toHaveCount(3)

    // 1. 칩을 누르면 보내지고, 로그인 전이라 막히면 말풍선 아래 카카오, 구글 단추
    await chips.first().click()
    const gate = page.locator('.os-login-gate')
    await expect(gate).toBeVisible()
    const kakao = gate.getByRole('link', { name: '카카오로 시작' })
    await expect(kakao).toHaveAttribute('href', new RegExp(`^/login\\?next=%2Fos%2Fchat%2F${PLANNING}&provider=kakao$`))
    await expect(gate.getByRole('link', { name: '구글로 시작' })).toHaveAttribute('href', /provider=google/)
    // 공식 로고가 단추 안에 있다
    await expect(kakao.locator('svg')).toHaveCount(1)
    await expect(gate.getByRole('link', { name: '구글로 시작' }).locator('svg path')).toHaveCount(4)
    await expect(page.locator('.os-first-tasks')).toHaveCount(0)
})

test('2, 7: 연결 화면 = 대화로 돌아가기, 회색 연결하기 단추 없음, 곧 열려요', async ({ page }, info) => {
    await page.goto('/os/connect', { waitUntil: 'domcontentloaded' })
    await settle(page)
    await expect(page.getByRole('button', { name: /대화로 돌아가기/ })).toBeVisible()
    await expect(page.locator('.os-soon, .os-connect-login').first()).toBeVisible()
    await expect(page.locator('button:disabled', { hasText: '연결하기' })).toHaveCount(0)
    if (isPhone(info.project.name)) {
        // 폰: 「명단」 단추로 서랍이 열린다
        await page.locator('.os-onepage-bar').getByRole('button', { name: '봇 명단 열기' }).click()
        await expect(page.locator('#os-nav.is-open')).toBeVisible()
    }
})

test('7: 붙일 수 있는 게 있는데 로그인 전이면 「로그인하면 연결할 수 있어요」 + 로그인 단추', async ({ page }) => {
    const svc = (id: string, name: string, ready: boolean) => ({ id, name, logo: '/icons/curi-192.png', hint: `${name} 설명`, can: '', ready, comingSoon: false, connected: null })
    await page.route('**/api/connect', r => r.fulfill({ json: { enabled: true, loggedIn: false, services: [svc('google', '구글', true), svc('kakao', '카카오', false)] } }))
    await page.goto('/os/connect', { waitUntil: 'domcontentloaded' })
    await settle(page)
    const card = page.locator('.os-connect-login')
    await expect(card).toContainText('로그인하면 연결할 수 있어요')
    await expect(card.getByRole('link', { name: '카카오로 시작' })).toHaveAttribute('href', '/login?next=%2Fos%2Fconnect&provider=kakao')
    await expect(card.getByRole('link', { name: '구글로 시작' }).locator('svg')).toHaveCount(1)
    await expect(page.locator('.os-soon')).toContainText('카카오')
})

test('2: 봇 마켓 안내 글은 폰에서 「왼쪽 명단」이라 하지 않는다', async ({ page }, info) => {
    await page.goto('/os/market', { waitUntil: 'domcontentloaded' })
    await settle(page)
    const sub = page.locator('.os-market-sub')
    if (isPhone(info.project.name)) {
        await expect(sub.locator('.os-only-narrow')).toBeVisible()
        await expect(sub.locator('.os-only-wide')).toBeHidden()
    } else {
        await expect(sub.locator('.os-only-wide')).toBeVisible()
    }
})

test('3: 소개 화면 첫 화면 안에 제목, 카카오로 시작, 먼저 둘러보기', async ({ page }) => {
    await page.goto('/os/welcome', { waitUntil: 'domcontentloaded' })
    await settle(page)
    const vh = page.viewportSize()!.height
    for (const name of ['카카오로 시작', '먼저 둘러보기']) {
        const b = await page.getByRole('link', { name, exact: true }).first().boundingBox()
        expect(b, `${name} 이 안 보인다`).not.toBeNull()
        expect(b!.y + b!.height, `${name} 이 첫 화면 밖(${Math.round(b!.y)}px)`).toBeLessThanOrEqual(vh)
    }
    await expect(page.getByRole('link', { name: '카카오로 시작', exact: true }).first()).toHaveAttribute('href', /provider=kakao/)
    await expect(page.getByRole('link', { name: '카카오로 시작', exact: true }).first().locator('svg')).toHaveCount(1)
    await expect(page.getByRole('link', { name: '구글로 시작', exact: true }).first().locator('svg')).toHaveCount(1)
    // 위계: 구글 = 카카오와 같은 크기로 바로 아래, 먼저 둘러보기는 그 아래 작은 단추
    const k = (await page.getByRole('link', { name: '카카오로 시작', exact: true }).first().boundingBox())!
    const g = (await page.getByRole('link', { name: '구글로 시작', exact: true }).first().boundingBox())!
    const tour = (await page.getByRole('link', { name: '먼저 둘러보기', exact: true }).first().boundingBox())!
    expect(Math.abs(g.height - k.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(g.width - k.width)).toBeLessThanOrEqual(1)
    expect(g.y).toBeGreaterThan(k.y)
    expect(tour.y).toBeGreaterThan(g.y)
    expect(tour.height).toBeLessThan(g.height)

    // 첫 화면 설명은 한 줄만: 긴 설명 문단과 부제는 없다
    await expect(page.locator('.wel-hero').getByText('나만의 AI 팀을 만들어보세요.', { exact: true })).toBeVisible()
    await expect(page.locator('.wel-hero .wel-p, .wel-hero .wel-lead')).toHaveCount(0)
})

test('4: 로그인 = 동의 없이 누르면 약관 칸을 짚고 안내, 줄은 44px 이상', async ({ page }) => {
    await page.goto('/login?next=%2Fos', { waitUntil: 'domcontentloaded' })
    await settle(page)
    const kakao = page.getByRole('button', { name: /카카오로 시작하기/ })
    await expect(kakao).toBeEnabled()
    await kakao.click()
    await expect(page.getByTestId('login-error')).toContainText('필수 약관 3개')
    await expect(page.getByTestId('login-consent')).toHaveAttribute('data-flash', '1')
    await expect(page).toHaveURL(/\/login/)
    const heights = await page.getByTestId('login-consent').locator('label').evaluateAll(els => els.map(e => e.getBoundingClientRect().height))
    expect(heights.length).toBe(4)
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44)
    // 모두 동의 → 안내가 걷힌다
    await page.getByTestId('login-consent').getByText('모두 동의', { exact: true }).click()
    await expect(page.getByTestId('login-error')).toHaveCount(0)
})

test('10: 설치 안내는 첫 방문엔 안 뜨고 두 번째 방문(새 탭)에 아래 띠로 뜬다', async ({ page, context }) => {
    await page.goto('/studio', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    await expect(page.locator('[aria-label="앱으로 설치하기"]')).toHaveCount(0)
    const second = await context.newPage()
    await second.goto('/studio', { waitUntil: 'domcontentloaded' })
    const bar = second.locator('[aria-label="앱으로 설치하기"]')
    await expect(bar).toBeVisible({ timeout: 8000 })
    await expect(bar.getByRole('button', { name: '설치 안내 닫기' })).toBeVisible()
    // 창이 아니라 띠: 화면 아래쪽 절반에 있다
    const b = await bar.boundingBox()
    expect(b!.y).toBeGreaterThan(second.viewportSize()!.height / 2)
})

test('큐리 초록: 로그인 화면 캐릭터와 글자가 검정이 아니다', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await settle(page)
    const body = await page.locator('.bot-avatar circle[r="22"]').first().evaluate(e => getComputedStyle(e).fill)
    expect(body).toBe('rgb(34, 197, 94)')
    const word = await page.getByRole('heading', { name: '큐리 AI' }).evaluate(e => getComputedStyle(e).color)
    expect(word).toBe('rgb(34, 197, 94)')
    await expect(page.getByRole('button', { name: /카카오로 시작하기/ }).locator('svg')).toHaveCount(1)
})
