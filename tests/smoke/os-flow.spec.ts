// 2) 봇 팀 화면 흐름: 타일 4개 → 첫 타일 클릭 → 대화 머리에 봇 이름 → 입력창 → 입력하면 캐릭터가 듣는 상태
// 3) 폰 크기에서 가로 스크롤 없음
import { test, expect } from '@playwright/test'
import { watchConsole, settle } from './helpers'

test('시연 팀: 타일 4개 → 첫 봇 대화 → 입력 중 캐릭터 listening', async ({ page, baseURL }) => {
    const watch = watchConsole(page, baseURL!)
    await page.goto('/os?demo=1', { waitUntil: 'domcontentloaded' })
    await settle(page)

    // 폰은 명단이 서랍에 들어가 있다(0923 반쪽 화면 서랍). 열어야 이름이 보인다
    const drawer = page.getByRole('button', { name: '봇 명단 열기' })
    if (await drawer.isVisible()) await drawer.click()

    // 왼쪽 명단에 시연 봇 4개(기본 팀과 같다)
    const tiles = page.locator('.os-shell .os-roster .os-bot-tile')
    await expect(tiles, '봇 타일이 4개여야 한다').toHaveCount(4)

    // 첫 타일 이름을 읽고 클릭
    const firstName = (await tiles.first().locator('.os-bot-name').innerText()).trim()
    expect(firstName.length, '첫 타일 이름이 비어 있다').toBeGreaterThan(0)
    await tiles.first().click()
    await expect(page).toHaveURL(/\/os\/chat\/[^/?]+\?demo=1/)

    // 대화 머리에 같은 이름
    const head = page.locator('.os-chat-head')
    await expect(head).toBeVisible()
    await expect(head).toContainText(firstName)

    // 입력창 보임 → 글자 넣으면 캐릭터 data-state="listening"
    const input = page.locator('.os-input')
    await expect(input).toBeVisible()
    await input.fill('안녕')   // 보내지는 않는다(엔터 안 침) = 대화 API 호출 0
    await expect(head.locator('.bot-avatar')).toHaveAttribute('data-state', 'listening')

    expect(watch.errors, `우리 코드 콘솔 오류:\n${watch.errors.join('\n')}`).toEqual([])
})

test('폰 크기에서 가로 스크롤 없음', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', '폰 프로젝트에서만 본다')
    for (const path of ['/os/welcome', '/os?demo=1']) {
        await page.goto(path, { waitUntil: 'domcontentloaded' })
        await settle(page)
        const { scrollWidth, innerWidth } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
        }))
        expect(scrollWidth, `${path} 가 옆으로 넘친다 (문서 ${scrollWidth}px > 화면 ${innerWidth}px)`).toBeLessThanOrEqual(innerWidth)
    }
})
