// 블로그 계정 = 글마다 전문 저장 (1005). RSS 가 요약(약 370자)만 주면 글 주소를 열어 전문을 읽고,
// 못 읽으면 요약이라도 저장하되 같은 글을 요약과 전문으로 두 번 넣지 않는다. 인터넷은 가짜.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const loadFeedFrom = vi.fn()
const fillTextByReading = vi.fn()
vi.mock('../rss', async orig => ({
    ...(await orig<typeof import('../rss')>()),
    loadFeedFrom: (...a: unknown[]) => loadFeedFrom(...a),
    fillTextByReading: (...a: unknown[]) => fillTextByReading(...a),
}))

const { fetchPodcastItems } = await import('../podcast')

const feed = { id: 'f1', mentorId: 'm1', userId: 'u1', kind: 'podcast', handleOrUrl: 'https://rss.blog.naver.com/me.xml', status: 'connected', lastSyncedAt: null, lastError: null, itemCount: 0, createdAt: '2026-10-01T00:00:00Z' } as never
const entry = (n: number, description: string) => ({
    title: `글 ${n}`, url: `https://blog.naver.com/me/${n}?fromRss=true&trackingCode=rss`, content: '', description,
    publishedAt: `2026-09-0${n}T00:00:00.000Z`, hasMedia: false,
})
const 요약 = '이 글은 요약입니다. '.repeat(20)
const 전문 = '이 글은 아주 긴 전문입니다. 많은 내용이 들어 있어요. '.repeat(60)

beforeEach(() => { loadFeedFrom.mockReset(); fillTextByReading.mockReset() })

describe('블로그 글 전문 저장', () => {
    it('요약뿐인 글은 글 주소를 열어 전문으로 저장한다 (요약은 따로 넣지 않는다)', async () => {
        loadFeedFrom.mockResolvedValue({ url: 'x', entries: [entry(1, 요약), entry(2, 요약)] })
        fillTextByReading.mockImplementation(async (c: { title: string; url: string }[]) => ({
            items: c.map(i => ({ ...i, text: 전문 })), failed: [], cut: false, unread: [],
        }))
        const r = await fetchPodcastItems(feed, null, {})
        expect(r.items).toHaveLength(2)
        expect(r.items.every(i => (i.text ?? '').length > 1500)).toBe(true)
        expect(new Set(r.items.map(i => i.url)).size).toBe(2)          // 같은 글이 두 번 없다
        expect(r.items.map(i => i.url).sort()).toEqual(['https://blog.naver.com/me/1', 'https://blog.naver.com/me/2'])   // 주소 꼬리표를 뗀다
    })

    it('RSS 가 이미 전문을 주면 글 주소를 열지 않는다', async () => {
        loadFeedFrom.mockResolvedValue({ url: 'x', entries: [entry(1, 전문)] })
        const r = await fetchPodcastItems(feed, null, {})
        expect(fillTextByReading).not.toHaveBeenCalled()
        expect(r.items).toHaveLength(1)
        expect(r.items[0].text!.length).toBeGreaterThan(1500)
    })

    it('전문을 못 읽으면 요약이라도 저장하고 안내한다 (버리지 않는다)', async () => {
        loadFeedFrom.mockResolvedValue({ url: 'x', entries: [entry(1, 요약)] })
        fillTextByReading.mockImplementation(async (c: unknown[]) => ({ items: [], failed: ['응답 403'], cut: false, unread: c }))
        const r = await fetchPodcastItems(feed, null, {})
        expect(r.items).toHaveLength(1)
        expect(r.note).toMatch(/요약만/)
    })
})
