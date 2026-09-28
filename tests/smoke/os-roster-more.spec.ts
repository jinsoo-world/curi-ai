// 봇이 많을 때 명단 = 앞 6명 + 「더 보기 (+N)」 → 펴면 전부 + 「접기」 (대표 지시 0928).
// 읽기만 한다: /api/os/team 응답을 이 시험 안에서만 가짜 9명으로 바꿔 그린다(서버, 저장 안 건드림).
import { test, expect, type Page } from '@playwright/test'
import { settle } from './helpers'

// 앞 4명 = 시연 팀 mentorId(실제 공개 봇), 뒤 5명 = 가짜
const REAL = [
    '9fc9b3fa-1721-40c6-bc4e-1b544c117483', 'a5a7fc67-2238-4705-bcc7-505e52644e25',
    '91db92f7-5831-40a5-8941-4501fb543f56', '94835097-6f27-4ee4-ab73-f423da271537',
]
const NAMES = ['봇하나', '봇둘', '봇셋', '봇넷', '봇다섯', '봇여섯', '봇일곱', '조사팀장', '봇아홉']
const SHAPES = ['clover', 'circle', 'hex', 'drop']
const COLORS = ['green', 'orange', 'blue', 'yellow']
// 8번째(조사팀장) = 실제 봇 → /os/chat/<그 id> 로 가면 「6명 밖 고른 봇」
const TEAM = NAMES.map((name, i) => ({
    id: `t-${i + 1}`, mentorId: i === 7 ? REAL[3] : i < 3 ? REAL[i] : `00000000-0000-4000-8000-00000000000${i}`,
    name, role: 'helper', shape: SHAPES[i % 4], color: COLORS[i % 4], oneLiner: `${name} 소개 한 줄`,
    approvalMode: 'always_ask', pinned: false, hidden: false, sortOrder: i, avatarUrl: null,
    systemPrompt: '', greeting: '안녕하세요', knowledgeCount: 0, createdAt: '',
}))

async function mockTeam(page: Page) {
    await page.route('**/api/os/team', r => r.fulfill({ json: { guest: false, team: TEAM } }))
    await page.route('**/api/os/channels', r => r.fulfill({ json: { channels: [] } }))
}
async function openDrawer(page: Page) {
    const drawer = page.getByRole('button', { name: '봇 명단 열기' })
    if (await drawer.isVisible()) await drawer.click()
}
const tiles = (page: Page) => page.locator('.os-shell .os-roster .os-bot-tile')
const more = (page: Page) => page.locator('.os-shell .os-roster-more')

async function noOverlap(page: Page) {
    const hits = await tiles(page).evaluateAll(els => {
        const rs = els.map(e => e.getBoundingClientRect()); const out: string[] = []
        for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
            const a = rs[i], b = rs[j]
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`${i}-${j}`)
        }
        return out
    })
    expect(hits, `타일 겹침: ${hits.join(', ')}`).toEqual([])
}

test('봇 9명: 앞 6명 + 더 보기 (+3) → 펴면 9명 + 접기, 새로 고쳐도 편 상태 기억', async ({ page }) => {
    await mockTeam(page)
    await page.goto(`/os/chat/${REAL[0]}`, { waitUntil: 'domcontentloaded' })   // 대화 머리에 서랍 단추가 있다
    await settle(page)
    await openDrawer(page)

    await expect(tiles(page)).toHaveCount(6)
    await expect(more(page)).toHaveText('더 보기 (+3)')
    await noOverlap(page)

    await more(page).click()
    await expect(tiles(page)).toHaveCount(9)
    await expect(more(page)).toHaveText('접기')
    await noOverlap(page)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await settle(page)
    await openDrawer(page)
    await expect(tiles(page)).toHaveCount(9)

    await more(page).click()
    await expect(tiles(page)).toHaveCount(6)
})

test('접혀 있어도 6명 밖의 고른 봇은 보인다, 검색은 접기와 상관없이 다 보인다', async ({ page }) => {
    await mockTeam(page)
    await page.goto(`/os/chat/${REAL[3]}`, { waitUntil: 'domcontentloaded' })
    await settle(page)
    await openDrawer(page)

    await expect(tiles(page)).toHaveCount(6)
    await expect(tiles(page).last()).toHaveAttribute('aria-current', 'true')
    await expect(tiles(page).last().locator('.os-bot-name')).toHaveText('조사팀장')

    await page.locator('.os-search input').fill('봇')
    await expect(tiles(page)).toHaveCount(8)   // 이름에 「봇」 = 8명 (조사팀장 빼고)
    await expect(more(page)).toHaveCount(0)
})
