// 인스타그램 연결 DB 쪽 — 저장(잠금), 끊기(열쇠만), 다시 연결 필요, 열쇠 연장, 배우기 가져오기, 메타 해제·삭제
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { randomBytes } from 'crypto'
import { makeFakeDb, type FakeDb } from '@/domains/os/feeds/__tests__/fake-db'
import { decryptSecret } from '@/domains/connectors/crypto'
import { igTokenKey, INSTAGRAM_RECONNECT_NOTE, INSTAGRAM_DISCONNECTED_NOTE } from '../core'
import {
    saveInstagramConnection, disconnectInstagram, readInstagramConnection, loadInstagramToken, instagramFetcher,
    prepareInstagramSync, refreshInstagramTokens, deauthorizeInstagramUser, requestInstagramDataDeletion,
    processInstagramDeletions, readInstagramDeletion, InstagramTooManyFeeds, IG_TABLE, IG_LEARNED_TABLE, recordInstagramSources,
} from '../store'
import type { KnowledgeFeed } from '@/domains/os/feeds/types'

const master = randomBytes(32)
let fake: FakeDb
const login = (over: Partial<Parameters<typeof saveInstagramConnection>[2]['login']> = {}) => ({
    accessToken: 'IGTOKEN-SECRET', expiresAt: new Date(Date.now() + 60 * 86400_000).toISOString(),
    igUserId: '17841400000', igScopedId: '777', username: 'jin.ceo', accountType: 'MEDIA_CREATOR', ...over,
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const feedOf = (): KnowledgeFeed => {
    const r = fake.tables.knowledge_feeds.find(f => f.sns_slot === 'instagram')!
    return { id: String(r.id), mentorId: String(r.mentor_id), userId: String(r.user_id), kind: 'instagram', handleOrUrl: String(r.handle_or_url), status: r.status as 'connected', lastSyncedAt: null, lastError: null, itemCount: 0, createdAt: '', snsSlot: 'instagram', syncCursor: (r.sync_cursor as string) ?? null }
}

beforeEach(() => {
    fake = makeFakeDb({ knowledge_feeds: [], knowledge_sources: [], knowledge_chunks: [], [IG_TABLE]: [], instagram_deletion_requests: [], instagram_learned_sources: [] })
})

describe('연결 저장', () => {
    it('열쇠는 잠겨 들어가고(원문 없음) SNS 인스타그램 칸 줄이 생긴다', async () => {
        await saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId: 'm1', login: login() })
        const row = fake.tables[IG_TABLE][0]
        expect(JSON.stringify(row)).not.toContain('IGTOKEN-SECRET')
        expect(decryptSecret(String(row.token_encrypted), igTokenKey(master))).toBe('IGTOKEN-SECRET')
        expect(() => decryptSecret(String(row.token_encrypted), master)).toThrow()   // 마스터 열쇠 그대로는 안 열린다(용도 분리)
        expect(row).toMatchObject({ mentor_id: 'm1', user_id: 'u1', username: 'jin.ceo', status: 'connected', ig_user_id: '17841400000', ig_scoped_id: '777' })
        expect(fake.tables.knowledge_feeds[0]).toMatchObject({ mentor_id: 'm1', sns_slot: 'instagram', kind: 'instagram', handle_or_url: 'https://www.instagram.com/jin.ceo/', status: 'connected' })
        expect(await readInstagramConnection(fake.db, 'm1')).toMatchObject({ username: 'jin.ceo', status: 'connected' })
    })

    it('다시 연결하면 같은 줄을 갈아 끼운다(봇 하나에 하나)', async () => {
        await saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId: 'm1', login: login() })
        fake.tables.knowledge_feeds[0].sync_cursor = '2026-10-01T00:00:00.000Z'
        await saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId: 'm1', login: login({ accessToken: 'NEW' }) })
        expect(fake.tables[IG_TABLE]).toHaveLength(1)
        expect(fake.tables.knowledge_feeds).toHaveLength(1)
        expect(fake.tables.knowledge_feeds[0].sync_cursor).toBe('2026-10-01T00:00:00.000Z')   // 같은 계정이면 기준 유지
        await saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId: 'm1', login: login({ username: 'other' }) })
        expect(fake.tables.knowledge_feeds[0].sync_cursor).toBeNull()                         // 다른 계정이면 처음부터
    })

    it('연결 줄이 이미 5개면 거절', async () => {
        fake.tables.knowledge_feeds = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, mentor_id: 'm1', user_id: 'u1', kind: 'website', handle_or_url: `https://a${i}.com`, status: 'connected', created_at: '' }))
        await expect(saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId: 'm1', login: login() })).rejects.toBeInstanceOf(InstagramTooManyFeeds)
    })
})

describe('끊기, 열쇠 꺼내기', () => {
    it('끊으면 열쇠만 지우고 배운 자료는 남는다. 연결 줄은 멈춤', async () => {
        await saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId: 'm1', login: login() })
        fake.tables.knowledge_sources.push({ id: 's1', mentor_id: 'm1', feed_id: fake.tables.knowledge_feeds[0].id, title: '[인스타그램] 글', original_url: 'https://www.instagram.com/p/A/' })
        expect(await disconnectInstagram(fake.db, 'm1')).toBe(true)
        expect(fake.tables[IG_TABLE][0]).toMatchObject({ token_encrypted: null, status: 'disconnected', ig_user_id: '17841400000' })
        expect(fake.tables.knowledge_feeds[0]).toMatchObject({ status: 'paused', last_error: INSTAGRAM_DISCONNECTED_NOTE })
        expect(fake.tables.knowledge_sources).toHaveLength(1)
        expect(await loadInstagramToken(fake.db, master, 'm1')).toEqual({ status: 'disconnected' })
    })
    it('끝난 열쇠는 다시 연결 필요', async () => {
        await saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId: 'm1', login: login({ expiresAt: new Date(Date.now() - 1000).toISOString() }) })
        expect(await loadInstagramToken(fake.db, master, 'm1')).toEqual({ status: 'needs_reconnect' })
        expect(await loadInstagramToken(fake.db, master, 'nope')).toEqual({ status: 'none' })
    })
    it('표가 아직 없으면 연결 없음으로 본다', async () => {
        const f2 = makeFakeDb({}, { missingTables: [IG_TABLE] })
        expect(await readInstagramConnection(f2.db, 'm1')).toBeNull()
        expect(await loadInstagramToken(f2.db, master, 'm1')).toEqual({ status: 'none' })
    })
})

describe('배우기 가져오기', () => {
    const media = (i: number, ts: string, caption = `게시물 ${i} 이야기를 길게 적어 봅니다 오늘의 생각`) =>
        ({ id: String(i), caption, media_type: 'IMAGE', permalink: `https://www.instagram.com/p/P${i}/`, timestamp: ts })

    it('글만 자료로, 이미 배운 주소는 건너뛰고, 끝까지 봤으면 가장 최신 시각을 기준으로', async () => {
        const f = vi.fn(async () => json({ data: [media(3, '2026-10-03T00:00:00+0000'), media(2, '2026-10-02T00:00:00+0000'), media(1, '2026-10-01T00:00:00+0000', '짧음')] })) as unknown as typeof fetch
        const r = await instagramFetcher('T', { fetchImpl: f })({} as KnowledgeFeed, null, { isKnown: u => u.endsWith('/P2/') })
        expect(r.items.map(i => i.url)).toEqual(['https://www.instagram.com/p/P3/'])
        expect(r.cursor).toBe('2026-10-03T00:00:00.000Z')
        expect(r.note).toContain('1개')
    })

    it('지난 기준 시각에 닿으면 멈춘다', async () => {
        const f = vi.fn(async () => json({ data: [media(3, '2026-10-03T00:00:00+0000'), media(2, '2026-10-02T00:00:00+0000')], paging: { next: 'https://graph.instagram.com/x?after=1' } })) as unknown as typeof fetch
        const r = await instagramFetcher('T', { fetchImpl: f })({} as KnowledgeFeed, null, { cursor: '2026-10-02T00:00:00.000Z' })
        expect(r.items.map(i => i.url)).toEqual(['https://www.instagram.com/p/P3/'])
        expect(r.cursor).toBe('2026-10-03T00:00:00.000Z')
        expect(f).toHaveBeenCalledTimes(1)
    })

    it('요금제 한도로 덜 가져오면 기준을 옮기지 않는다', async () => {
        const f = vi.fn(async () => json({ data: [media(3, '2026-10-03T00:00:00+0000'), media(2, '2026-10-02T00:00:00+0000')] })) as unknown as typeof fetch
        const r = await instagramFetcher('T', { fetchImpl: f })({} as KnowledgeFeed, null, { maxItems: 1 })
        expect(r.items).toHaveLength(1)
        expect(r.cursor).toBeUndefined()
    })

    it('준비: 열쇠가 없으면 밖에 안 나가고 멈춤, 190 이 오면 다시 연결 필요로 표시', async () => {
        expect(await prepareInstagramSync(fake.db, null, {} as KnowledgeFeed)).toMatchObject({ stop: { status: 'paused' } })
        await saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId: 'm1', login: login() })
        const bad = vi.fn(async () => json({ error: { code: 190, message: 'x' } }, 400)) as unknown as typeof fetch
        const p = await prepareInstagramSync(fake.db, master, feedOf(), { fetchImpl: bad })
        if (!('fetcher' in p)) throw new Error('fetcher 가 있어야 한다')
        await expect(p.fetcher(feedOf(), null, {})).rejects.toThrow(INSTAGRAM_RECONNECT_NOTE)
        expect(fake.tables[IG_TABLE][0].status).toBe('needs_reconnect')
        expect(fake.tables.knowledge_feeds[0]).toMatchObject({ status: 'error', last_error: INSTAGRAM_RECONNECT_NOTE })
        expect(await prepareInstagramSync(fake.db, master, feedOf())).toMatchObject({ stop: { status: 'error', note: INSTAGRAM_RECONNECT_NOTE } })
    })
})

describe('열쇠 연장 (매일 크론)', () => {
    const now = Date.parse('2026-10-07T00:00:00Z')
    const day = 86400_000
    async function seed(mentorId: string, expInDays: number, refreshedDaysAgo: number) {
        await saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId, login: login({ accessToken: `T-${mentorId}`, expiresAt: new Date(now + expInDays * day).toISOString() }) }, now - refreshedDaysAgo * day)
    }
    it('24시간 지났고 15일 안에 끝나는 것만 연장, 190 은 다시 연결, 끝난 건 다시 연결', async () => {
        await seed('due', 10, 2)
        await seed('fresh', 10, 0)
        await seed('far', 40, 5)
        await seed('dead', 5, 3)
        await seed('gone', -1, 3)
        const f = vi.fn(async (u: string) => {
            const t = new URL(u).searchParams.get('access_token')
            if (t === 'T-dead') return json({ error: { code: 190, message: 'x' } }, 400)
            return json({ access_token: `${t}-NEW`, expires_in: 5184000 })
        }) as unknown as typeof fetch
        const r = await refreshInstagramTokens(fake.db, master, { nowMs: now, fetchImpl: f })
        expect(r).toMatchObject({ refreshed: 1, reconnect: 2, failed: 0 })
        const row = (m: string) => fake.tables[IG_TABLE].find(x => x.mentor_id === m)!
        expect(decryptSecret(String(row('due').token_encrypted), igTokenKey(master))).toBe('T-due-NEW')
        expect(row('due').token_expires_at).toBe(new Date(now + 5184000_000).toISOString())
        expect(decryptSecret(String(row('fresh').token_encrypted), igTokenKey(master))).toBe('T-fresh')
        expect(row('dead').status).toBe('needs_reconnect')
        expect(row('gone').status).toBe('needs_reconnect')
        expect(f).toHaveBeenCalledTimes(2)
    })
})

describe('메타 연결 해제, 정보 삭제', () => {
    it('해제: 그 계정(앱 범위 번호든 계정 번호든)의 열쇠를 전부 지운다', async () => {
        await saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId: 'm1', login: login() })
        await saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId: 'm2', login: login() })
        await saveInstagramConnection(fake.db, master, { userId: 'u2', mentorId: 'm3', login: login({ igScopedId: '999', igUserId: '888' }) })
        expect(await deauthorizeInstagramUser(fake.db, '777')).toBe(2)
        expect(fake.tables[IG_TABLE].filter(r => r.token_encrypted === null).map(r => r.mentor_id).sort()).toEqual(['m1', 'm2'])
        expect(await deauthorizeInstagramUser(fake.db, '888')).toBe(1)
    })

    it('배운 자료에 그때 연결된 인스타그램 계정 번호를 붙인다(이미 붙인 건 그대로)', async () => {
        await saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId: 'm1', login: login() })
        const feedId = fake.tables.knowledge_feeds[0].id
        fake.tables.knowledge_sources.push({ id: 's1', mentor_id: 'm1', feed_id: feedId, title: '[인스타그램] 글1', original_url: 'https://www.instagram.com/p/A/' })
        expect(await recordInstagramSources(fake.db, 'm1', String(feedId))).toBe(1)
        expect(fake.tables[IG_LEARNED_TABLE]).toEqual([expect.objectContaining({ source_id: 's1', mentor_id: 'm1', ig_user_id: '17841400000', ig_scoped_id: '777' })])
        await saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId: 'm1', login: login({ igUserId: '555', igScopedId: '556', username: 'new.acct' }) })
        fake.tables.knowledge_sources.push({ id: 's2', mentor_id: 'm1', feed_id: feedId, title: '[인스타그램] 새 글', original_url: 'https://www.instagram.com/p/N/' })
        expect(await recordInstagramSources(fake.db, 'm1', String(feedId))).toBe(1)
        expect(fake.tables[IG_LEARNED_TABLE].map(r => [r.source_id, r.ig_user_id])).toEqual([['s1', '17841400000'], ['s2', '555']])
    })

    async function seedTwoAccounts() {
        // 같은 봇이 옛 계정(17841400000/777)으로 s-old 를, 새 계정(555/556)으로 s-new 를 배웠다. s-blog 는 블로그 글
        await saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId: 'm1', login: login() })
        const feedId = String(fake.tables.knowledge_feeds[0].id)
        fake.tables.knowledge_sources.push({ id: 's-old', mentor_id: 'm1', feed_id: feedId, title: '[인스타그램] 옛 글', original_url: 'https://www.instagram.com/p/O/' })
        await recordInstagramSources(fake.db, 'm1', feedId)
        await saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId: 'm1', login: login({ igUserId: '555', igScopedId: '556', username: 'new.acct' }) })
        fake.tables.knowledge_sources.push(
            { id: 's-new', mentor_id: 'm1', feed_id: feedId, title: '[인스타그램] 새 글', original_url: 'https://www.instagram.com/p/N/' },
            { id: 's-blog', mentor_id: 'm1', feed_id: null, title: '[네이버 블로그] 글', original_url: 'https://blog.naver.com/x/1' },
        )
        await recordInstagramSources(fake.db, 'm1', feedId)
        return feedId
    }

    it('지금 연결된 계정의 삭제: 열쇠·연결 줄을 바로 지우고, 크론은 그 계정 글만 지운다', async () => {
        await seedTwoAccounts()
        const code = await requestInstagramDataDeletion(fake.db, '556')
        expect(code).toMatch(/^[0-9a-f]{24}$/)
        expect(fake.tables[IG_TABLE]).toHaveLength(0)
        expect(fake.tables.knowledge_feeds.filter(f => f.sns_slot === 'instagram')).toHaveLength(0)
        expect(await readInstagramDeletion(fake.db, code)).toMatchObject({ status: 'pending' })
        expect(await processInstagramDeletions(fake.db)).toEqual({ done: 1, removed: 1 })
        expect(fake.tables.knowledge_sources.map(s => s.id).sort()).toEqual(['s-blog', 's-old'])
        expect(await readInstagramDeletion(fake.db, code)).toMatchObject({ status: 'done' })
        expect(await readInstagramDeletion(fake.db, 'not-a-code')).toBeNull()
    })

    it('옛 계정 번호로만 찾은 봇: 지금 연결·연결 줄은 그대로, 옛 계정 글만 지운다', async () => {
        await seedTwoAccounts()
        expect(fake.tables[IG_TABLE][0].previous_ig_ids).toEqual(['17841400000', '777'])
        const code = await requestInstagramDataDeletion(fake.db, '777')
        expect(fake.tables[IG_TABLE][0]).toMatchObject({ ig_user_id: '555', status: 'connected' })
        expect(fake.tables.instagram_deletion_requests[0].mentor_ids).toEqual(['m1'])
        expect(await processInstagramDeletions(fake.db)).toEqual({ done: 1, removed: 1 })
        expect(fake.tables.knowledge_sources.map(s => s.id).sort()).toEqual(['s-blog', 's-new'])
        expect(fake.tables.knowledge_feeds.filter(f => f.sns_slot === 'instagram')).toHaveLength(1)
        expect(fake.tables[IG_TABLE][0].status).toBe('connected')
        expect(await readInstagramDeletion(fake.db, code)).toMatchObject({ status: 'done' })
    })

    it('같은 계정의 처리 전 요청이 있으면 같은 접수 번호. 그래도 연결 지우기는 매번 다시 한다', async () => {
        const a = await requestInstagramDataDeletion(fake.db, '123')
        expect(await requestInstagramDataDeletion(fake.db, '123')).toBe(a)
        expect(fake.tables.instagram_deletion_requests).toHaveLength(1)
        // 접수 뒤 같은 계정을 다시 연결했다가 메타가 요청을 또 보내면 다시 지운다
        await saveInstagramConnection(fake.db, master, { userId: 'u1', mentorId: 'm1', login: login({ igUserId: '123', igScopedId: '124' }) })
        expect(await requestInstagramDataDeletion(fake.db, '123')).toBe(a)
        expect(fake.tables[IG_TABLE]).toHaveLength(0)
        expect(fake.tables.instagram_deletion_requests[0].mentor_ids).toEqual(['m1'])
    })

    it('연결한 적 없는 계정 삭제 요청도 접수 번호를 주고 바로 끝난다', async () => {
        const code = await requestInstagramDataDeletion(fake.db, '123')
        expect(await processInstagramDeletions(fake.db)).toEqual({ done: 1, removed: 0 })
        expect(await readInstagramDeletion(fake.db, code)).toMatchObject({ status: 'done' })
    })
})
