// 계정 연결 동기화 = 같은 글 두 번 안 넣기, 자료 10개 한도, 고장 기록, 준비 중, 끊기(자료 남김/같이 지움)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeDb } from './fake-db'
import type { KnowledgeFeed, FetchNewItems } from '../types'

const addKnowledgeSource = vi.fn()
vi.mock('@/domains/knowledge', () => ({
    addKnowledgeSource: (...args: unknown[]) => addKnowledgeSource(...args),
}))

const { syncFeed, FEED_CAP_FULL_NOTE } = await import('../sync')
const { deleteFeed } = await import('../store')
const { SOCIAL_STUB_NOTE } = await import('../social-stub')

const M = 'mentor-1'
function feedRow(over: Partial<Record<string, unknown>> = {}) {
    return {
        id: 'feed-1', mentor_id: M, user_id: 'user-1', kind: 'website', handle_or_url: 'https://a.com',
        status: 'connected', last_synced_at: null, last_error: null, item_count: 0, created_at: '2026-09-01T00:00:00Z', ...over,
    }
}
function feedOf(row: ReturnType<typeof feedRow>): KnowledgeFeed {
    return {
        id: row.id as string, mentorId: row.mentor_id as string, userId: row.user_id as string, kind: row.kind as KnowledgeFeed['kind'],
        handleOrUrl: row.handle_or_url as string, status: row.status as KnowledgeFeed['status'], lastSyncedAt: row.last_synced_at as string | null,
        lastError: row.last_error as string | null, itemCount: row.item_count as number, createdAt: row.created_at as string,
    }
}
const 글 = (n: number) => ({ title: `글 ${n}`, url: `https://a.com/post/${n}`, text: `본문 ${n} `.repeat(10) })

beforeEach(() => {
    addKnowledgeSource.mockReset()
})

/** addKnowledgeSource 흉내 = 가짜 표에 자료 한 줄을 넣는다 */
function wireAdd(tables: Record<string, Record<string, unknown>[]>) {
    let n = 0
    addKnowledgeSource.mockImplementation(async (_db: unknown, mentorId: string, title: string, _text: string, type: string, url: string) => {
        const row = { id: `src-new-${++n}`, mentor_id: mentorId, title, source_type: type, original_url: url }
        tables.knowledge_sources.push(row)
        return row
    })
}

describe('syncFeed = 같은 주소는 두 번 넣지 않는다', () => {
    it('이미 자료로 있는 주소는 건너뛰고 새 주소만 넣는다, feed_id 도 붙인다', async () => {
        const fake = makeFakeDb({
            knowledge_feeds: [feedRow()],
            knowledge_sources: [{ id: 'src-old', mentor_id: M, original_url: 'https://a.com/post/1' }],
        })
        wireAdd(fake.tables)
        let seenKnown: boolean | undefined
        const fetcher: FetchNewItems = async (_f, _since, opts) => {
            seenKnown = opts?.isKnown?.('https://a.com/post/1')
            return { items: [글(1), 글(2)] }
        }
        const r = await syncFeed(fake.db, feedOf(feedRow()), { fetchers: { website: fetcher } })

        expect(seenKnown).toBe(true)                         // 가져오기 쪽에도 「이미 있음」을 알려 준다
        expect(r.ok).toBe(true)
        expect(r.added).toBe(1)
        expect(r.skipped).toBe(1)
        expect(addKnowledgeSource).toHaveBeenCalledTimes(1)
        expect(addKnowledgeSource.mock.calls[0][5]).toBe('https://a.com/post/2')
        const created = fake.tables.knowledge_sources.find(s => s.original_url === 'https://a.com/post/2')
        expect(created?.feed_id).toBe('feed-1')
        const feed = fake.tables.knowledge_feeds[0]
        expect(feed.status).toBe('connected')
        expect(feed.item_count).toBe(1)
        expect(feed.last_error).toBeNull()
        expect(feed.last_synced_at).toBeTruthy()
    })

    it('같은 연결을 두 번 돌려도(수동 + 크론) 두 번째는 아무것도 안 넣는다', async () => {
        const fake = makeFakeDb({ knowledge_feeds: [feedRow()], knowledge_sources: [] })
        wireAdd(fake.tables)
        const fetcher: FetchNewItems = async () => ({ items: [글(1)] })
        await syncFeed(fake.db, feedOf(feedRow()), { fetchers: { website: fetcher } })
        const r2 = await syncFeed(fake.db, feedOf(feedRow()), { fetchers: { website: fetcher } })
        expect(r2.added).toBe(0)
        expect(r2.skipped).toBe(1)
        expect(addKnowledgeSource).toHaveBeenCalledTimes(1)
    })
})

describe('syncFeed = 자료 10개 한도', () => {
    it('칸이 다 찼으면 밖에 나가지 않고 이유를 적는다(시각은 적어서 헛돌지 않는다)', async () => {
        const sources = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, mentor_id: M, original_url: `https://x.com/${i}` }))
        const fake = makeFakeDb({ knowledge_feeds: [feedRow()], knowledge_sources: sources })
        const fetcher = vi.fn<FetchNewItems>(async () => ({ items: [글(1)] }))
        const r = await syncFeed(fake.db, feedOf(feedRow()), { fetchers: { website: fetcher } })
        expect(fetcher).not.toHaveBeenCalled()
        expect(r.lastError).toBe(FEED_CAP_FULL_NOTE)
        expect(fake.tables.knowledge_feeds[0].last_error).toBe(FEED_CAP_FULL_NOTE)
        expect(fake.tables.knowledge_feeds[0].last_synced_at).toBeTruthy()
    })

    it('남은 칸만큼만 넣고 멈춘다', async () => {
        const sources = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, mentor_id: M, original_url: `https://x.com/${i}` }))
        const fake = makeFakeDb({ knowledge_feeds: [feedRow()], knowledge_sources: sources })
        wireAdd(fake.tables)
        let maxItems: number | undefined
        const fetcher: FetchNewItems = async (_f, _s, opts) => { maxItems = opts?.maxItems; return { items: [글(1), 글(2), 글(3)] } }
        const r = await syncFeed(fake.db, feedOf(feedRow()), { fetchers: { website: fetcher } })
        expect(maxItems).toBe(2)
        expect(r.added).toBe(2)
        expect(r.lastError).toBe(FEED_CAP_FULL_NOTE)
    })
})

describe('syncFeed = 고장, 준비 중', () => {
    it('가져오기가 던지면 status=error 와 이유를 적고, 던지지 않는다', async () => {
        const fake = makeFakeDb({ knowledge_feeds: [feedRow()], knowledge_sources: [] })
        const fetcher: FetchNewItems = async () => { throw new Error('이 사이트는 robots.txt 로 자동 읽기를 막아 두었어요') }
        const r = await syncFeed(fake.db, feedOf(feedRow()), { fetchers: { website: fetcher } })
        expect(r.ok).toBe(false)
        expect(r.status).toBe('error')
        expect(fake.tables.knowledge_feeds[0].status).toBe('error')
        expect(fake.tables.knowledge_feeds[0].last_error).toContain('robots.txt')
    })

    it('X, Instagram, TikTok 은 준비 중(paused)으로 두고 아무것도 가져오지 않는다', async () => {
        const row = feedRow({ kind: 'instagram', handle_or_url: '@me', status: 'paused' })
        const fake = makeFakeDb({ knowledge_feeds: [row], knowledge_sources: [] })
        const r = await syncFeed(fake.db, feedOf(row))
        expect(r.status).toBe('paused')
        expect(r.added).toBe(0)
        expect(fake.tables.knowledge_feeds[0].last_error).toBe(SOCIAL_STUB_NOTE)
        expect(addKnowledgeSource).not.toHaveBeenCalled()
    })
})

describe('deleteFeed = 끊을 때 자료를 남길지 고른다', () => {
    function setup() {
        return makeFakeDb({
            knowledge_feeds: [feedRow({ item_count: 2 })],
            knowledge_sources: [
                { id: 'src-a', mentor_id: M, feed_id: 'feed-1', original_url: 'https://a.com/post/1', source_type: 'url' },
                { id: 'src-b', mentor_id: M, feed_id: 'feed-1', original_url: 'https://a.com/post/2', source_type: 'url' },
                { id: 'src-c', mentor_id: M, feed_id: null, original_url: 'https://other.com/x', source_type: 'url' },
            ],
            knowledge_chunks: [
                { id: 'c1', source_id: 'src-a', mentor_id: M }, { id: 'c2', source_id: 'src-b', mentor_id: M },
                { id: 'c3', source_id: 'src-c', mentor_id: M },
            ],
        })
    }

    it('deleteSources=true 면 이 연결로 가져온 자료와 조각을 같이 지운다', async () => {
        const fake = setup()
        const r = await deleteFeed(fake.db, M, 'feed-1', true)
        expect(r.removedSources).toBe(2)
        expect(fake.tables.knowledge_sources.map(s => s.id)).toEqual(['src-c'])
        expect(fake.tables.knowledge_chunks.map(c => c.id)).toEqual(['c3'])
        expect(fake.tables.knowledge_feeds).toHaveLength(0)
    })

    it('deleteSources=false(기본) 면 연결 줄만 지우고 자료와 조각은 남긴다', async () => {
        const fake = setup()
        const r = await deleteFeed(fake.db, M, 'feed-1')
        expect(r.removedSources).toBe(0)
        expect(fake.tables.knowledge_sources).toHaveLength(3)
        expect(fake.tables.knowledge_chunks).toHaveLength(3)
        expect(fake.tables.knowledge_feeds).toHaveLength(0)
        // 자료 표는 건드리지 않는다(feed_id 는 DB 규칙 ON DELETE SET NULL 이 비운다)
        expect(fake.calls.some(c => c.table === 'knowledge_sources' && c.op === 'delete')).toBe(false)
    })

    it('다른 봇의 연결 번호로는 못 끊는다', async () => {
        const fake = setup()
        await expect(deleteFeed(fake.db, 'mentor-other', 'feed-1', true)).rejects.toThrow('못 찾았어요')
        expect(fake.tables.knowledge_feeds).toHaveLength(1)
        expect(fake.tables.knowledge_sources).toHaveLength(3)
    })

    it('표가 아직 없으면 FeedTableMissing (API 가 「준비 중」으로 바꾼다)', async () => {
        const { FeedTableMissing, listFeeds } = await import('../store')
        const fake = makeFakeDb({}, { missingTables: ['knowledge_feeds'] })
        await expect(listFeeds(fake.db, M)).rejects.toBeInstanceOf(FeedTableMissing)
    })
})
