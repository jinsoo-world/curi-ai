// 1) 주요 화면이 열리고(200) 우리 코드 콘솔 오류가 0 인지
import { test, expect } from '@playwright/test'
import { watchConsole, attachIgnored, settle } from './helpers'

const PAGES = [
    { path: '/', name: '첫 화면' },
    { path: '/os/welcome', name: '손님 소개 화면' },
    { path: '/os?demo=1', name: '봇 팀 둘러보기(시연)' },
]

for (const p of PAGES) {
    test(`${p.name} ${p.path} 가 열리고 콘솔 오류 0`, async ({ page, baseURL }, testInfo) => {
        const watch = watchConsole(page, baseURL!)
        const res = await page.goto(p.path, { waitUntil: 'domcontentloaded' })
        expect(res, '응답이 없다').not.toBeNull()
        // 리다이렉트가 있으면 마지막 도착지의 상태코드를 본다
        expect(res!.status(), `${p.path} 상태코드`).toBe(200)
        await settle(page)
        // 페이지가 통째로 오류 화면(error.tsx)로 떨어진 건 아닌지
        await expect(page.locator('body')).not.toContainText(/Application error|문제가 생겼어요/i)
        attachIgnored(testInfo, watch)
        expect(watch.errors, `우리 코드 콘솔 오류:\n${watch.errors.join('\n')}`).toEqual([])
    })
}
