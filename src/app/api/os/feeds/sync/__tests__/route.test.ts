// /api/os/feeds/sync — SNS 줄이면 배우기(learn)와 같은 횟수 열쇠로 막는다 (보안 검토 PR #53). 일반 줄은 예전 그대로
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeDb, type FakeDb } from '@/domains/os/feeds/__tests__/fake-db'

let fake: FakeDb
const keys: string[] = []
let deny = ''
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u-owner' } } }) } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fake.db }))
vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: async (_db: unknown, key: string) => { keys.push(key); return { allowed: !(deny && key.startsWith(deny)), remaining: 1 } },
}))
const syncSnsFeed = vi.fn(async () => ({ ok: true, added: 0 }))
const syncFeed = vi.fn(async () => ({ ok: true, added: 0 }))
vi.mock('@/domains/os/bot-sns', async (orig) => ({ ...(await orig<typeof import('@/domains/os/bot-sns')>()), syncSnsFeed: () => syncSnsFeed() }))
vi.mock('@/domains/os/feeds/sync', async (orig) => ({ ...(await orig<typeof import('@/domains/os/feeds/sync')>()), syncFeed: () => syncFeed() }))

const { POST } = await import('@/app/api/os/feeds/sync/route')
const post = (feedId: string) => POST(new Request('https://x/api/os/feeds/sync', { method: 'POST', body: JSON.stringify({ mentorId: 'm-1', feedId }) }) as never)
const row = (id: string, sns: string | null) => ({ id, mentor_id: 'm-1', user_id: 'u-owner', kind: 'podcast', handle_or_url: 'https://rss.blog.naver.com/a.xml', status: 'connected', last_synced_at: null, last_error: null, item_count: 0, created_at: '', sns_slot: sns })

beforeEach(() => {
    keys.length = 0; deny = ''
    syncSnsFeed.mockClear(); syncFeed.mockClear()
    fake = makeFakeDb({
        mentors: [{ id: 'm-1', creator_id: 'cp-1' }],
        creator_profiles: [{ id: 'cp-1', user_id: 'u-owner' }],
        knowledge_feeds: [row('f-sns', 'blog'), row('f-plain', null)],
        knowledge_sources: [],
    })
})

describe('/api/os/feeds/sync', () => {
    it('SNS 줄 = 배우기와 같은 열쇠(봇 분당·하루, 회원 하루), 막히면 429', async () => {
        expect((await post('f-sns')).status).toBe(200)
        expect(keys).toEqual(['sns-learn:m:m-1', 'sns-learn:d:m-1', 'sns-learn:u:u-owner'])
        expect(syncSnsFeed).toHaveBeenCalledTimes(1)
        deny = 'sns-learn:d:'
        expect((await post('f-sns')).status).toBe(429)
        expect(syncSnsFeed).toHaveBeenCalledTimes(1)
    })
    it('일반 줄은 횟수 열쇠 없이 예전처럼', async () => {
        expect((await post('f-plain')).status).toBe(200)
        expect(keys).toEqual([])
        expect(syncFeed).toHaveBeenCalledTimes(1)
    })
})
