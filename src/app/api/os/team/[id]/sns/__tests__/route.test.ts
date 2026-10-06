// /api/os/team/[id]/sns, /sns/learn — 손님 401, 주인 아님 403, 틀린 주소 400(칸 이름), 횟수 제한 429, 저장하면 칸 4개 상태
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeDb, type FakeDb } from '@/domains/os/feeds/__tests__/fake-db'

let user: { id: string } | null = { id: 'u-owner' }
let fake: FakeDb
const limits: Record<string, boolean> = {}
const limitCalls: { key: string; limit: number; windowSec: number; opts?: { failClosed?: boolean } }[] = []

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fake.db }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
    checkRateLimit: async (_db: unknown, key: string, limit: number, windowSec: number, opts?: { failClosed?: boolean }) => {
        limitCalls.push({ key, limit, windowSec, opts })
        return { allowed: limits[`${key.split(':').slice(0, 2).join(':')}`] !== false, remaining: 1 }
    },
}))
const learnBotSns = vi.fn()
vi.mock('@/domains/os/bot-sns', async (orig) => {
    const real = await orig<typeof import('@/domains/os/bot-sns')>()
    return { ...real, learnBotSns: (...a: unknown[]) => learnBotSns(...a) }
})

const { GET, PUT } = await import('@/app/api/os/team/[id]/sns/route')
const { POST } = await import('@/app/api/os/team/[id]/sns/learn/route')

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const put = (id: string, body: unknown) => PUT(new Request(`https://x/api/os/team/${id}/sns`, { method: 'PUT', body: JSON.stringify(body) }), ctx(id))
const learn = (id: string, body: unknown = {}) => POST(new Request(`https://x/api/os/team/${id}/sns/learn`, { method: 'POST', body: JSON.stringify(body) }), ctx(id))

beforeEach(() => {
    user = { id: 'u-owner' }
    for (const k of Object.keys(limits)) delete limits[k]
    limitCalls.length = 0
    learnBotSns.mockReset().mockResolvedValue([{ slot: 'blog', ok: true, added: 3, skipped: 0, failed: 0, note: null }])
    fake = makeFakeDb({
        team_bots: [{ id: 'tb-mine', user_id: 'u-owner', mentor_id: 'm-1' }, { id: 'tb-market', user_id: 'u-fan', mentor_id: 'm-1' }],
        mentors: [{ id: 'm-1', creator_id: 'cp-1', links: [] }],
        creator_profiles: [{ id: 'cp-1', user_id: 'u-owner' }],
        knowledge_feeds: [],
        knowledge_sources: [],
    })
})

describe('GET, PUT /api/os/team/[id]/sns', () => {
    it('손님 401, 주인 아님 403', async () => {
        user = null
        expect((await GET(new Request('https://x'), ctx('tb-mine'))).status).toBe(401)
        user = { id: 'u-fan' }
        expect((await GET(new Request('https://x'), ctx('tb-market'))).status).toBe(403)
        expect((await put('tb-market', { blog: 'blog.naver.com/jin' })).status).toBe(403)
    })

    it('틀린 주소는 400 + 어느 칸인지', async () => {
        const res = await put('tb-mine', { blog: 'http://127.0.0.1/rss' })
        expect(res.status).toBe(400)
        expect(await res.json()).toMatchObject({ field: 'blog' })
        expect((await put('tb-mine', { blog: 123 })).status).toBe(400)
        expect((await put('tb-mine', { nope: 'x' })).status).toBe(400)
    })

    it('저장하면 칸 4개 상태를 돌려준다', async () => {
        const res = await put('tb-mine', { blog: 'blog.naver.com/jin_01', instagram: '@jin.ceo' })
        expect(res.status).toBe(200)
        const d = await res.json()
        expect(d.ok).toBe(true)
        expect(d.accounts.map((a: { slot: string }) => a.slot)).toEqual(['instagram', 'blog', 'youtube', 'curious'])
        expect(d.accounts[1]).toMatchObject({ url: 'https://blog.naver.com/jin_01', canLearn: true, status: 'ready' })
        expect(d.total).toMatchObject({ plan: 'free', cap: 20, learnedCount: 0 })

        const g = await (await GET(new Request('https://x'), ctx('tb-mine'))).json()
        expect(g.accounts[0]).toMatchObject({ slot: 'instagram', status: 'coming_soon', canLearn: false })
    })

    it('저장은 분당 10번까지 (429)', async () => {
        limits['sns-save:u-owner'] = false
        expect((await put('tb-mine', { blog: 'blog.naver.com/jin_01' })).status).toBe(429)
    })
})

describe('POST /api/os/team/[id]/sns/learn', () => {
    it('주인 아님 403, 배우지 않는다', async () => {
        user = { id: 'u-fan' }
        expect((await learn('tb-market')).status).toBe(403)
        expect(learnBotSns).not.toHaveBeenCalled()
    })

    it('봇마다 분당 2번, 하루 10번. 셀 수 없으면 막는다(failClosed)', async () => {
        await learn('tb-mine')
        expect(limitCalls.map(c => [c.key, c.limit, c.windowSec, c.opts?.failClosed])).toEqual([
            ['sns-learn:m:m-1', 2, 60, true],
            ['sns-learn:d:m-1', 10, 86_400, true],
        ])
        limits['sns-learn:m'] = false
        expect((await learn('tb-mine')).status).toBe(429)
        delete limits['sns-learn:m']
        limits['sns-learn:d'] = false
        expect((await learn('tb-mine')).status).toBe(429)
    })

    it('slots 가 틀리면 400, 맞으면 결과와 칸 상태를 돌려준다', async () => {
        expect((await learn('tb-mine', { slots: ['tiktok'] })).status).toBe(400)
        const res = await learn('tb-mine', { slots: ['blog'] })
        expect(res.status).toBe(200)
        const d = await res.json()
        expect(learnBotSns.mock.calls.at(-1)?.[1]).toMatchObject({ mentorId: 'm-1', slots: ['blog'] })
        expect(d.results[0]).toMatchObject({ slot: 'blog', added: 3 })
        expect(d.accounts).toHaveLength(4)
    })
})
