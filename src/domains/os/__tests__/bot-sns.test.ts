// 봇 「내 SNS 연결」 = 주소 검증(모양, SSRF), 주인 확인, 같은 글 건너뛰기, 요금제 상한, RSS 읽기(가짜 RSS 즉석 생성)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeDb } from '../feeds/__tests__/fake-db'
import type { KnowledgeFeed } from '../feeds/types'

// 밖으로 나가는 요청은 전부 가짜. 차단 규칙(isSafeFetchUrl)은 진짜를 쓴다
const fetchPageSafely = vi.fn()
vi.mock('@/domains/agent/fetch-url', async (orig) => {
    const real = await orig<typeof import('@/domains/agent/fetch-url')>()
    return { ...real, fetchPageSafely: (...a: unknown[]) => fetchPageSafely(...a) }
})
const readUrl = vi.fn()
vi.mock('@/domains/os/readers', async (orig) => {
    const real = await orig<typeof import('@/domains/os/readers')>()
    return { ...real, readUrl: (...a: unknown[]) => readUrl(...a) }
})
const addKnowledgeSource = vi.fn()
vi.mock('@/domains/knowledge', () => ({
    addKnowledgeSource: (...a: unknown[]) => addKnowledgeSource(...a),
}))

const sns = await import('../bot-sns')
const { BotNotMine } = await import('../knowledge')

beforeEach(() => {
    fetchPageSafely.mockReset()
    readUrl.mockReset()
    addKnowledgeSource.mockReset()
})

/* ─────────────── 가짜 RSS, Atom 즉석 생성 ─────────────── */
function rss(n: number, body = (i: number) => `본문 ${i} `.repeat(400)): string {
    const items = Array.from({ length: n }, (_, i) => `<item><title>글 ${i + 1}</title><link>https://blog.naver.com/jin/22300000${String(i + 1).padStart(2, '0')}</link>`
        + `<description><![CDATA[${body(i + 1)}]]></description><pubDate>${new Date(Date.UTC(2026, 8, 1 + i)).toUTCString()}</pubDate></item>`).join('')
    return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>진 블로그</title>${items}</channel></rss>`
}
function atom(n: number): string {
    const entries = Array.from({ length: n }, (_, i) => `<entry><title>영상 ${i + 1}</title><link rel="alternate" href="https://www.youtube.com/watch?v=abcdefghi${String(i).padStart(2, '0')}"/>`
        + `<published>2026-09-${String(i + 1).padStart(2, '0')}T00:00:00Z</published><media:group><media:description>영상 ${i + 1} 설명입니다. 오늘은 마케팅 이야기를 합니다.</media:description></media:group></entry>`).join('')
    return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><title>채널</title>${entries}</feed>`
}
const page = (url: string, body: string) => ({ ok: true, url, requestedUrl: url, body, contentType: 'application/xml' })

/* ─────────────── 1. 주소 검증 ─────────────── */
describe('normalizeSnsInput = 모양과 SSRF', () => {
    it('빈 값은 null (지우기)', async () => {
        expect(await sns.normalizeSnsInput('blog', '')).toBeNull()
        expect(await sns.normalizeSnsInput('blog', null)).toBeNull()
        expect(await sns.normalizeSnsInput('instagram', '   ')).toBeNull()
    })

    it('네이버 블로그 주소는 공개 RSS 로 바꾼다 (모바일, rss 주소, blogId 모양 전부)', async () => {
        for (const raw of ['blog.naver.com/jin_01', 'https://m.blog.naver.com/jin_01', 'https://rss.blog.naver.com/jin_01.xml', 'https://blog.naver.com/PostList.naver?blogId=jin_01']) {
            const r = await sns.normalizeSnsInput('blog', raw)
            expect(r?.publicUrl).toBe('https://blog.naver.com/jin_01')
            expect(r?.fetch).toEqual({ kind: 'podcast', handleOrUrl: 'https://rss.blog.naver.com/jin_01.xml' })
        }
    })

    it('다른 블로그는 RSS, Atom 주소면 받는다. 티스토리는 /rss', async () => {
        expect((await sns.normalizeSnsInput('blog', 'https://example.com/feed.xml'))?.fetch).toEqual({ kind: 'podcast', handleOrUrl: 'https://example.com/feed.xml' })
        expect((await sns.normalizeSnsInput('blog', 'jin.tistory.com'))?.fetch).toEqual({ kind: 'podcast', handleOrUrl: 'https://jin.tistory.com/rss' })
    })

    it('RSS 가 아닌 일반 사이트 주소는 RSS 를 달라고 한다', async () => {
        await expect(sns.normalizeSnsInput('blog', 'https://example.com/about')).rejects.toThrow(/RSS/)
    })

    it('🛡 안쪽 주소(SSRF)와 이상한 스킴은 막는다', async () => {
        for (const raw of ['http://localhost/feed.xml', 'http://127.0.0.1/rss', 'http://10.0.0.5/feed.xml', 'http://169.254.169.254/latest/feed.xml', 'http://[::1]/rss', 'https://me@evil.com/rss']) {
            await expect(sns.normalizeSnsInput('blog', raw)).rejects.toBeInstanceOf(sns.SnsInputError)
        }
        await expect(sns.normalizeSnsInput('blog', 'javascript:alert(1)')).rejects.toBeInstanceOf(sns.SnsInputError)
        await expect(sns.normalizeSnsInput('blog', 'ftp://example.com/rss')).rejects.toBeInstanceOf(sns.SnsInputError)
        await expect(sns.normalizeSnsInput('blog', 'https://example.com/' + 'a'.repeat(400) + '.xml')).rejects.toThrow(/길어요/)
    })

    it('인스타그램은 @아이디, 아이디, 주소를 받고 글 하나 주소는 막는다. 가져오기는 없다', async () => {
        for (const raw of ['@jin.ceo', 'jin.ceo', 'instagram.com/jin.ceo', 'https://www.instagram.com/jin.ceo/?hl=ko']) {
            const r = await sns.normalizeSnsInput('instagram', raw)
            expect(r).toEqual({ publicUrl: 'https://www.instagram.com/jin.ceo/', fetch: null })
        }
        await expect(sns.normalizeSnsInput('instagram', 'https://www.instagram.com/p/ABC123/')).rejects.toThrow(/계정/)
        await expect(sns.normalizeSnsInput('instagram', 'https://evil.com/jin')).rejects.toBeInstanceOf(sns.SnsInputError)
    })

    it('유튜브 채널 번호 주소는 그대로, @핸들은 공식 API 로 번호를 찾는다', async () => {
        const ch = 'UC' + 'a'.repeat(22)
        const r1 = await sns.normalizeSnsInput('youtube', `https://www.youtube.com/channel/${ch}`)
        expect(r1?.fetch).toEqual({ kind: 'youtube', handleOrUrl: `https://www.youtube.com/channel/${ch}` })

        const resolveYoutubeHandle = vi.fn(async () => ch)
        const r2 = await sns.normalizeSnsInput('youtube', '@jinceo', { resolveYoutubeHandle })
        expect(resolveYoutubeHandle).toHaveBeenCalledWith('https://www.youtube.com/@jinceo')
        expect(r2).toEqual({ publicUrl: 'https://www.youtube.com/@jinceo', fetch: { kind: 'youtube', handleOrUrl: `https://www.youtube.com/channel/${ch}` } })
    })

    it('유튜브 @핸들을 공식으로 못 풀면(열쇠 없음) 채널 주소를 달라고 한다. 영상 하나 주소는 막는다', async () => {
        await expect(sns.normalizeSnsInput('youtube', '@jinceo', { resolveYoutubeHandle: async () => null })).rejects.toThrow(/channel\/UC/)
        await expect(sns.normalizeSnsInput('youtube', 'https://www.youtube.com/watch?v=abcdefghijk')).rejects.toThrow(/채널/)
        await expect(sns.normalizeSnsInput('youtube', 'https://vimeo.com/123')).rejects.toBeInstanceOf(sns.SnsInputError)
    })

    it('큐리어스는 리더, 글, 어울림 주소를 받고 다른 곳, 커뮤니티 첫 화면은 막는다', async () => {
        const r = await sns.normalizeSnsInput('curious', 'https://curious-500.com/v2/creator/1395')
        expect(r).toEqual({ publicUrl: 'https://curious-500.com/v2/creator/1395', fetch: { kind: 'website', handleOrUrl: 'https://curious-500.com/v2/creator/1395' } })
        expect((await sns.normalizeSnsInput('curious', 'curious-500.com/v2/community/post/2665'))?.fetch?.handleOrUrl).toContain('/post/2665')
        await expect(sns.normalizeSnsInput('curious', 'https://curious-500.com/v2/community')).rejects.toBeInstanceOf(sns.SnsInputError)
        await expect(sns.normalizeSnsInput('curious', 'https://curious-600.com/v2/creator/1')).rejects.toBeInstanceOf(sns.SnsInputError)
    })
})

/* ─────────────── 2. 주인 확인 ─────────────── */
function ownerTables() {
    return {
        team_bots: [
            { id: 'tb-mine', user_id: 'u-owner', mentor_id: 'm-1' },
            { id: 'tb-market', user_id: 'u-fan', mentor_id: 'm-1' },     // 마켓에서 데려온 봇 = 팀엔 있지만 주인 아님
        ],
        mentors: [{ id: 'm-1', creator_id: 'cp-1', links: [{ kind: 'kakao', url: 'https://open.kakao.com/o/x' }] }],
        creator_profiles: [{ id: 'cp-1', user_id: 'u-owner' }],
        knowledge_feeds: [] as Record<string, unknown>[],
        knowledge_sources: [] as Record<string, unknown>[],
    }
}

describe('resolveOwnedBot = 봇 주인만', () => {
    it('내가 만든 봇이면 봇 번호를 준다', async () => {
        const fake = makeFakeDb(ownerTables())
        expect(await sns.resolveOwnedBot(fake.db, 'u-owner', 'tb-mine')).toBe('m-1')
    })
    it('팀에 데려왔지만 내가 만들지 않은 봇은 거절', async () => {
        const fake = makeFakeDb(ownerTables())
        await expect(sns.resolveOwnedBot(fake.db, 'u-fan', 'tb-market')).rejects.toBeInstanceOf(BotNotMine)
    })
    it('남의 팀 칸 번호를 적어 보내도 거절', async () => {
        const fake = makeFakeDb(ownerTables())
        await expect(sns.resolveOwnedBot(fake.db, 'u-fan', 'tb-mine')).rejects.toBeInstanceOf(BotNotMine)
        await expect(sns.resolveOwnedBot(fake.db, '', 'tb-mine')).rejects.toBeInstanceOf(BotNotMine)
    })
})

/* ─────────────── 3. 저장 ─────────────── */
describe('saveBotSns = 공개 링크(mentors.links) + 배우기 연결(knowledge_feeds.sns_slot)', () => {
    it('주소를 넣으면 공개 링크와 연결 줄이 생기고, 다른 링크(카카오)는 그대로 남는다', async () => {
        const fake = makeFakeDb(ownerTables())
        await sns.saveBotSns(fake.db, { userId: 'u-owner', mentorId: 'm-1', input: { blog: 'blog.naver.com/jin_01', instagram: '@jin.ceo' } })
        const links = fake.tables.mentors[0].links as { kind: string; url: string }[]
        expect(links).toEqual([
            { kind: 'kakao', url: 'https://open.kakao.com/o/x' },
            { kind: 'instagram', url: 'https://www.instagram.com/jin.ceo/' },
            { kind: 'blog', url: 'https://blog.naver.com/jin_01' },
        ])
        // 인스타그램은 연결 줄을 만들지 않는다(가져오기 없음). 블로그만
        expect(fake.tables.knowledge_feeds).toHaveLength(1)
        expect(fake.tables.knowledge_feeds[0]).toMatchObject({ mentor_id: 'm-1', kind: 'podcast', handle_or_url: 'https://rss.blog.naver.com/jin_01.xml', sns_slot: 'blog' })
    })

    it('주소를 바꾸면 연결 줄을 새 주소로, 비우면 링크와 연결 줄을 뺀다(배운 자료는 남김)', async () => {
        const fake = makeFakeDb(ownerTables())
        await sns.saveBotSns(fake.db, { userId: 'u-owner', mentorId: 'm-1', input: { blog: 'blog.naver.com/jin_01' } })
        fake.tables.knowledge_sources.push({ id: 's-1', mentor_id: 'm-1', feed_id: fake.tables.knowledge_feeds[0].id, original_url: 'https://blog.naver.com/jin_01/1' })
        await sns.saveBotSns(fake.db, { userId: 'u-owner', mentorId: 'm-1', input: { blog: 'blog.naver.com/jin_02' } })
        expect(fake.tables.knowledge_feeds).toHaveLength(1)
        expect(fake.tables.knowledge_feeds[0].handle_or_url).toBe('https://rss.blog.naver.com/jin_02.xml')

        await sns.saveBotSns(fake.db, { userId: 'u-owner', mentorId: 'm-1', input: { blog: null } })
        expect(fake.tables.knowledge_feeds).toHaveLength(0)
        expect((fake.tables.mentors[0].links as { kind: string }[]).map(l => l.kind)).toEqual(['kakao'])
        expect(fake.tables.knowledge_sources).toHaveLength(1)
    })

    it('틀린 주소는 어느 칸인지와 함께 던지고 아무것도 안 바꾼다', async () => {
        const fake = makeFakeDb(ownerTables())
        const e = await sns.saveBotSns(fake.db, { userId: 'u-owner', mentorId: 'm-1', input: { blog: 'http://127.0.0.1/rss', instagram: '@ok_id' } }).catch(x => x)
        expect(e).toBeInstanceOf(sns.SnsInputError)
        expect((e as InstanceType<typeof sns.SnsInputError>).field).toBe('blog')
        expect(fake.tables.knowledge_feeds).toHaveLength(0)
        expect((fake.tables.mentors[0].links as unknown[]).length).toBe(1)
    })

    it('readBotSns = 칸 4개 상태 + 요금제 상한', async () => {
        const fake = makeFakeDb(ownerTables())
        await sns.saveBotSns(fake.db, { userId: 'u-owner', mentorId: 'm-1', input: { blog: 'blog.naver.com/jin_01', instagram: '@jin.ceo' } })
        const v = await sns.readBotSns(fake.db, 'm-1', 'free')
        expect(v.accounts.map(a => a.slot)).toEqual(['instagram', 'blog', 'youtube', 'curious'])
        expect(v.accounts[0]).toMatchObject({ slot: 'instagram', url: 'https://www.instagram.com/jin.ceo/', canLearn: false, status: 'coming_soon' })
        expect(v.accounts[1]).toMatchObject({ slot: 'blog', url: 'https://blog.naver.com/jin_01', canLearn: true, status: 'ready', learnedCount: 0, lastLearnedAt: null })
        expect(v.accounts[2]).toMatchObject({ slot: 'youtube', url: null, status: 'empty' })
        expect(v.total).toEqual({ learnedCount: 0, cap: sns.SNS_LEARN_CAP.free, plan: 'free' })
    })
})

/* ─────────────── 4. 가져오기 (가짜 RSS) ─────────────── */
function feedOf(over: Partial<KnowledgeFeed> = {}): KnowledgeFeed {
    return {
        id: 'feed-1', mentorId: 'm-1', userId: 'u-owner', kind: 'podcast', handleOrUrl: 'https://rss.blog.naver.com/jin.xml',
        status: 'connected', lastSyncedAt: null, lastError: null, itemCount: 0, createdAt: '2026-10-01T00:00:00Z', snsSlot: 'blog', ...over,
    }
}

describe('SNS 가져오기 = 블로그 RSS, 유튜브(제목, 설명만), 큐리어스', () => {
    it('블로그: 첫 배우기에도 최근 20개까지, 글 하나 최대 길이로 자른다', async () => {
        fetchPageSafely.mockImplementation(async (url: string) => page(url, rss(25, i => `본문 ${i} `.repeat(5000))))
        const r = await sns.SNS_FETCHERS.blog(feedOf(), null, { maxItems: 100 })
        expect(r.items).toHaveLength(sns.SNS_BLOG_MAX_POSTS)
        expect(r.items[0].title).toBe('글 25')                     // 최신 글부터
        expect(r.items.every(i => (i.text ?? '').length <= sns.SNS_ITEM_MAX_CHARS)).toBe(true)
        expect(readUrl).not.toHaveBeenCalled()                      // RSS 본문이 길면 글을 따로 열지 않는다
    })

    it('블로그: 이미 배운 주소는 읽지도 않는다', async () => {
        fetchPageSafely.mockImplementation(async (url: string) => page(url, rss(3)))
        const r = await sns.SNS_FETCHERS.blog(feedOf(), null, { isKnown: u => u.endsWith('2230000003') })
        expect(r.items.map(i => i.title)).toEqual(['글 2', '글 1'])
    })

    it('블로그: RSS 가 아니면 사람 말로 던진다', async () => {
        fetchPageSafely.mockImplementation(async (url: string) => page(url, '<html><body>안녕</body></html>'))
        await expect(sns.SNS_FETCHERS.blog(feedOf(), null, {})).rejects.toThrow(/RSS/)
    })

    it('유튜브: 공식 공개 피드의 제목과 설명만 쓴다. 자막 읽기(readUrl)를 부르지 않는다', async () => {
        const ch = 'UC' + 'b'.repeat(22)
        fetchPageSafely.mockImplementation(async (url: string) => page(url, atom(3)))
        const r = await sns.SNS_FETCHERS.youtube(feedOf({ kind: 'youtube', handleOrUrl: `https://www.youtube.com/channel/${ch}`, snsSlot: 'youtube' }), null, {})
        expect(fetchPageSafely.mock.calls[0][0]).toBe(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch}`)
        expect(r.items).toHaveLength(3)
        expect(r.items[0].title).toBe('영상 3')
        expect(r.items[0].text).toContain('영상 3 설명입니다')
        expect(readUrl).not.toHaveBeenCalled()
    })

    it('유튜브: 채널 번호가 없는 주소는 거절(채널 페이지를 긁지 않는다)', async () => {
        await expect(sns.SNS_FETCHERS.youtube(feedOf({ kind: 'youtube', handleOrUrl: 'https://www.youtube.com/@jin', snsSlot: 'youtube' }), null, {})).rejects.toThrow(/채널/)
        expect(fetchPageSafely).not.toHaveBeenCalled()
    })
})

/* ─────────────── 5. 배우기 = 중복 건너뛰기, 요금제 상한 ─────────────── */
function wireAdd(tables: Record<string, Record<string, unknown>[]>) {
    let n = 0
    addKnowledgeSource.mockImplementation(async (_db: unknown, mentorId: string, title: string, _t: string, type: string, url: string, o?: { meta?: { sourceKind?: string } }) => {
        const row = { id: `src-${++n}`, mentor_id: mentorId, title, source_type: type, original_url: url, source_kind: o?.meta?.sourceKind }
        tables.knowledge_sources.push(row)
        return row
    })
}
function learnTables(existingSnsItems = 0) {
    const t = ownerTables()
    t.knowledge_feeds.push({ id: 'feed-1', mentor_id: 'm-1', user_id: 'u-owner', kind: 'podcast', handle_or_url: 'https://rss.blog.naver.com/jin.xml', status: 'connected', last_synced_at: null, last_error: null, item_count: 0, created_at: '2026-10-01T00:00:00Z', sns_slot: 'blog' })
    for (let i = 0; i < existingSnsItems; i++) t.knowledge_sources.push({ id: `old-${i}`, mentor_id: 'm-1', feed_id: 'feed-1', original_url: `https://blog.naver.com/jin/old${i}`, processing_status: 'completed', chunk_count: 1 })
    return t
}

describe('syncSnsFeed = 배우기 한 번', () => {
    it('출처가 보이게 넣는다: 제목 앞에 SNS 이름, 넣은 방식 sns_blog, 주소', async () => {
        const fake = makeFakeDb(learnTables())
        wireAdd(fake.tables)
        fetchPageSafely.mockImplementation(async (url: string) => page(url, rss(2)))
        const r = await sns.syncSnsFeed(fake.db, feedOf())
        expect(r.added).toBe(2)
        const call = addKnowledgeSource.mock.calls[0]
        expect(call[2]).toBe('[네이버 블로그] 글 2')
        expect(call[5]).toBe('https://blog.naver.com/jin/2230000002')
        expect(call[6]?.meta).toMatchObject({ sourceKind: 'sns_blog', citationUrl: 'https://blog.naver.com/jin/2230000002', authorIsMe: true })
    })

    it('두 번 눌러도 같은 글은 두 번 안 들어간다', async () => {
        const fake = makeFakeDb(learnTables())
        wireAdd(fake.tables)
        fetchPageSafely.mockImplementation(async (url: string) => page(url, rss(2)))
        await sns.syncSnsFeed(fake.db, feedOf())
        const r2 = await sns.syncSnsFeed(fake.db, feedOf())
        expect(r2.added).toBe(0)
        expect(addKnowledgeSource).toHaveBeenCalledTimes(2)
    })

    it('요금제 상한: 무료 20개 중 19개를 이미 배웠으면 1개만 더', async () => {
        const fake = makeFakeDb(learnTables(sns.SNS_LEARN_CAP.free - 1))
        wireAdd(fake.tables)
        fetchPageSafely.mockImplementation(async (url: string) => page(url, rss(5)))
        const r = await sns.syncSnsFeed(fake.db, feedOf())
        expect(r.added).toBe(1)
    })

    it('상한에 닿았으면 밖에 나가지 않고 이유를 남긴다. 프로는 더 배운다', async () => {
        const fake = makeFakeDb(learnTables(sns.SNS_LEARN_CAP.free))
        wireAdd(fake.tables)
        const r = await sns.syncSnsFeed(fake.db, feedOf())
        expect(r.added).toBe(0)
        expect(r.lastError).toMatch(/한도/)
        expect(fetchPageSafely).not.toHaveBeenCalled()
        expect(fake.tables.knowledge_feeds[0].last_error).toMatch(/한도/)

        const pro = makeFakeDb({ ...learnTables(sns.SNS_LEARN_CAP.free), user_plans: [{ user_id: 'u-owner', plan: 'pro', expires_at: '2099-01-01T00:00:00Z' }] })
        wireAdd(pro.tables)
        fetchPageSafely.mockImplementation(async (url: string) => page(url, rss(2)))
        expect((await sns.syncSnsFeed(pro.db, feedOf())).added).toBe(2)
    })

    it('가져오기가 고장 나면 실패를 연결 줄에 적는다(던지지 않는다)', async () => {
        const fake = makeFakeDb(learnTables())
        fetchPageSafely.mockImplementation(async (url: string) => ({ ok: false, requestedUrl: url, reason: '주소를 못 열었어요' }))
        const r = await sns.syncSnsFeed(fake.db, feedOf())
        expect(r.ok).toBe(false)
        expect(fake.tables.knowledge_feeds[0]).toMatchObject({ status: 'error', last_error: '주소를 못 열었어요' })
    })
})
