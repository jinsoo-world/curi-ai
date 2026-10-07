// 봇 「내 SNS 연결」 = 주소 검증(모양, SSRF), 주인 확인, 같은 글 건너뛰기, 요금제 상한, RSS 읽기(가짜 RSS 즉석 생성)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomBytes } from 'crypto'
import { makeFakeDb } from '../feeds/__tests__/fake-db'
import type { KnowledgeFeed, FetchNewItems } from '../feeds/types'

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

    it('유튜브 채널 번호 주소는 그대로, @핸들은 풀기 함수로 번호를 찾는다', async () => {
        const ch = 'UC' + 'a'.repeat(22)
        const r1 = await sns.normalizeSnsInput('youtube', `https://www.youtube.com/channel/${ch}`)
        expect(r1?.fetch).toEqual({ kind: 'youtube', handleOrUrl: `https://www.youtube.com/channel/${ch}` })

        const resolveYoutubeHandle = vi.fn(async () => ch)
        const r2 = await sns.normalizeSnsInput('youtube', '@jinceo', { resolveYoutubeHandle })
        expect(resolveYoutubeHandle).toHaveBeenCalledWith('https://www.youtube.com/@jinceo')
        expect(r2).toEqual({ publicUrl: 'https://www.youtube.com/@jinceo', fetch: { kind: 'youtube', handleOrUrl: `https://www.youtube.com/channel/${ch}` } })
    })

    it('유튜브 @핸들 기본 풀기 = 기존 계정 연결과 같은 방식(채널 페이지 → 열쇠 있으면 공식 API). 열쇠 없어도 된다', async () => {
        const ch = 'UC' + 'c'.repeat(22)
        delete process.env.YOUTUBE_API_KEY
        fetchPageSafely.mockImplementation(async (url: string) => page(url, `<html><link rel="canonical" href="https://www.youtube.com/channel/${ch}"></html>`))
        const r = await sns.normalizeSnsInput('youtube', '@jinceo')
        expect(fetchPageSafely.mock.calls[0][0]).toBe('https://www.youtube.com/@jinceo')
        expect(r?.fetch).toEqual({ kind: 'youtube', handleOrUrl: `https://www.youtube.com/channel/${ch}` })
    })

    it('유튜브 채널을 못 찾으면 채널 주소를 달라고 한다. 영상 하나 주소는 막는다', async () => {
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

    it('동시에 두 번 저장해도 SNS 칸 줄은 하나 (upsert onConflict mentor_id,sns_slot)', async () => {
        const fake = makeFakeDb(ownerTables())
        await Promise.all([
            sns.saveBotSns(fake.db, { userId: 'u-owner', mentorId: 'm-1', input: { blog: 'blog.naver.com/jin_01' } }),
            sns.saveBotSns(fake.db, { userId: 'u-owner', mentorId: 'm-1', input: { blog: 'blog.naver.com/jin_02' } }),
        ])
        expect(fake.tables.knowledge_feeds.filter(f => f.sns_slot === 'blog')).toHaveLength(1)
    })

    it('봇당 연결 수(5)가 차 있으면 그 칸 이름과 함께 입력 오류', async () => {
        const t = ownerTables()
        for (let i = 0; i < 5; i++) t.knowledge_feeds.push({ id: `f${i}`, mentor_id: 'm-1', user_id: 'u-owner', kind: 'website', handle_or_url: `https://a${i}.com`, status: 'connected', created_at: '2026-10-01' })
        const fake = makeFakeDb(t)
        const e = await sns.saveBotSns(fake.db, { userId: 'u-owner', mentorId: 'm-1', input: { youtube: 'https://www.youtube.com/channel/UC' + 'a'.repeat(22) } }).catch(x => x)
        expect(e).toBeInstanceOf(sns.SnsInputError)
        expect(e.field).toBe('youtube')
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

    it('블로그: 피드는 1MB 까지만 받는다', async () => {
        fetchPageSafely.mockImplementation(async (url: string) => page(url, rss(2)))
        await sns.SNS_FETCHERS.blog(feedOf(), null, {})
        expect(fetchPageSafely.mock.calls[0][1]).toMatchObject({ maxBytes: sns.SNS_FEED_MAX_BYTES })
        expect(sns.SNS_FEED_MAX_BYTES).toBe(1024 * 1024)
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

    it('유튜브: 영상마다 기존 자막 읽기(readUrl)로 자막을 넣는다. 영상당 최대 길이', async () => {
        const ch = 'UC' + 'b'.repeat(22)
        fetchPageSafely.mockImplementation(async (url: string) => page(url, atom(3)))
        readUrl.mockImplementation(async (url: string, o: { maxChars?: number }) => ({ ok: true, url, requestedUrl: url, title: 't', text: `[유튜브 영상]\n\n[자막]\n${'말 '.repeat(30_000)}`.slice(0, o.maxChars), kind: 'youtube', method: 'captions' }))
        const r = await sns.SNS_FETCHERS.youtube(feedOf({ kind: 'youtube', handleOrUrl: `https://www.youtube.com/channel/${ch}`, snsSlot: 'youtube' }), null, {})
        expect(fetchPageSafely.mock.calls[0][0]).toBe(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch}`)
        expect(readUrl).toHaveBeenCalledTimes(3)
        expect(readUrl.mock.calls[0][1]).toMatchObject({ maxChars: sns.SNS_ITEM_MAX_CHARS })
        expect(r.items.map(i => i.title)).toEqual(['영상 3', '영상 2', '영상 1'])   // 최신 영상부터, 피드 제목 그대로
        expect(r.items[0].text).toContain('[자막]')
        expect(r.items.every(i => (i.text ?? '').length <= sns.SNS_ITEM_MAX_CHARS)).toBe(true)
        expect(r.note).toBeUndefined()
    })

    it('유튜브: 자막이 없거나 못 읽으면 제목, 설명으로 대신 넣고 이유를 남긴다', async () => {
        const ch = 'UC' + 'b'.repeat(22)
        fetchPageSafely.mockImplementation(async (url: string) => page(url, atom(3)))
        readUrl.mockImplementation(async (url: string) => url.endsWith('02')
            ? { ok: false, requestedUrl: url, reason: '이 영상은 열 수 없어요' }
            : url.endsWith('01')
                ? { ok: true, url, requestedUrl: url, title: 't', text: '[유튜브 영상] 영상 2\n\n[설명]\n설명\n\n(이 영상은 자막이 없어요)', kind: 'youtube', method: 'meta' }
                : { ok: true, url, requestedUrl: url, title: 't', text: '[자막]\n안녕하세요 오늘은 마케팅', kind: 'youtube', method: 'captions' })
        const r = await sns.SNS_FETCHERS.youtube(feedOf({ kind: 'youtube', handleOrUrl: `https://www.youtube.com/channel/${ch}`, snsSlot: 'youtube' }), null, {})
        expect(r.items).toHaveLength(3)
        const v3 = r.items.find(i => i.title === '영상 3')!
        expect(v3.text).toContain('영상 3 설명입니다')                        // 못 읽음 → 피드의 제목, 설명
        expect(r.items.find(i => i.title === '영상 2')!.text).toContain('자막이 없어요')   // 자막 없음 → 읽기 함수의 제목, 설명
        expect(r.note).toMatch(/1개.*자막/)
        expect(r.note).toMatch(/1개.*못 읽어/)
    })

    it('유튜브: 이미 배운 영상은 읽지 않고, 최근 SNS_YOUTUBE_MAX_VIDEOS 개까지만', async () => {
        const ch = 'UC' + 'b'.repeat(22)
        fetchPageSafely.mockImplementation(async (url: string) => page(url, atom(3)))
        readUrl.mockImplementation(async (url: string) => ({ ok: true, url, requestedUrl: url, title: 't', text: '[자막]\n안녕하세요 오늘은 마케팅', kind: 'youtube', method: 'captions' }))
        const r = await sns.SNS_FETCHERS.youtube(feedOf({ kind: 'youtube', handleOrUrl: `https://www.youtube.com/channel/${ch}`, snsSlot: 'youtube' }), null, { isKnown: u => u.endsWith('02') })
        expect(r.items.map(i => i.title)).toEqual(['영상 2', '영상 1'])
        expect(readUrl).toHaveBeenCalledTimes(2)
        expect(sns.SNS_YOUTUBE_MAX_VIDEOS).toBe(20)
    })

    it('유튜브: 저장된 주소가 @핸들이어도 채널 번호를 기존 방식으로 찾아 읽는다', async () => {
        const ch = 'UC' + 'd'.repeat(22)
        fetchPageSafely.mockImplementation(async (url: string) => url.includes('/feeds/') ? page(url, atom(1)) : page(url, `<link rel="canonical" href="https://www.youtube.com/channel/${ch}">`))
        readUrl.mockImplementation(async (url: string) => ({ ok: true, url, requestedUrl: url, title: 't', text: '[자막]\n안녕하세요 오늘은 마케팅', kind: 'youtube', method: 'captions' }))
        const r = await sns.SNS_FETCHERS.youtube(feedOf({ kind: 'youtube', handleOrUrl: 'https://www.youtube.com/@jin', snsSlot: 'youtube' }), null, {})
        expect(r.items).toHaveLength(1)
        expect(fetchPageSafely.mock.calls.some(c => String(c[0]).includes(`channel_id=${ch}`))).toBe(true)
    })
})

describe('유튜브 공개 피드가 막혔을 때 (1006 실측: 정상 채널에도 404)', () => {
    it('열쇠가 없으면 채널 「동영상」 화면에서 영상 번호를 찾아 자막을 읽는다. 제목은 읽기 결과에서', async () => {
        delete process.env.YOUTUBE_API_KEY
        const ch = 'UC' + 'e'.repeat(22)
        fetchPageSafely.mockImplementation(async (url: string) => url.includes('/feeds/')
            ? { ok: false, requestedUrl: url, reason: '응답 404' }
            : page(url, '{"videoId":"AAAAAAAAAAA","x":1}{"videoId":"BBBBBBBBBBB"}{"videoId":"AAAAAAAAAAA"}'))
        readUrl.mockImplementation(async (url: string) => ({ ok: true, url, requestedUrl: url, title: `제목 ${url.slice(-3)} | 채널`, text: '[자막]\n안녕하세요 오늘은 마케팅', kind: 'youtube', method: 'captions' }))
        const r = await sns.SNS_FETCHERS.youtube(feedOf({ kind: 'youtube', handleOrUrl: `https://www.youtube.com/channel/${ch}`, snsSlot: 'youtube' }), null, {})
        expect(fetchPageSafely.mock.calls.some(c => c[0] === `https://www.youtube.com/channel/${ch}/videos`)).toBe(true)
        expect(r.items.map(i => i.url)).toEqual(['https://www.youtube.com/watch?v=AAAAAAAAAAA', 'https://www.youtube.com/watch?v=BBBBBBBBBBB'])
        expect(r.items[0].title).toBe('제목 AAA')
    })

    it('videoIdsFromChannelPage = 나온 순서, 겹침 제거, 최대 개수', () => {
        const html = Array.from({ length: 30 }, (_, i) => `"videoId":"${String(i).padStart(11, 'v')}"`).join(',')
        expect(sns.videoIdsFromChannelPage(html)).toHaveLength(sns.SNS_YOUTUBE_MAX_VIDEOS)
        expect(sns.videoIdsFromChannelPage('"videoId":"aaaaaaaaaaa""videoId":"aaaaaaaaaaa"')).toEqual(['aaaaaaaaaaa'])
    })
})

/* ─────────────── 4-2. 큐리어스 = 리더 화면 + 그 리더가 쓴 커뮤니티 글 ─────────────── */
const W = 10272
type P = { id: number; writer: number; at: string }
function postList(posts: P[]) {
    return JSON.stringify({ postList: posts.map(p => ({ id: p.id, title: `글 ${p.id}`, createdAt: p.at, writerInfo: { writerId: p.writer, writerNickname: 'x' } })), totalCount: posts.length, page: 1, size: 200 })
}
function curiousApi(posts: P[], opts: { status?: (id: number) => string | undefined; extra?: (id: number) => Record<string, unknown> } = {}) {
    return async (url: string) => {
        const u = new URL(url)
        if (u.pathname === '/api/v2/posts') {
            const pg = Number(u.searchParams.get('page')), size = Number(u.searchParams.get('size'))
            return page(url, postList(posts.slice((pg - 1) * size, pg * size)))
        }
        const m = u.pathname.match(/^\/api\/v2\/posts\/(\d+)$/)
        if (m) return page(url, JSON.stringify({ result: 'success', message: 'ok', data: { id: Number(m[1]), title: `글 ${m[1]}`, content: `<p>${'본문입니다 '.repeat(20)}${m[1]}</p>`, status: opts.status ? opts.status(Number(m[1])) : 'published', createdAt: '2026-10-01T10:00:00', writerInfo: { writerId: W }, ...(opts.extra?.(Number(m[1])) ?? {}) } }))
        return { ok: false, requestedUrl: url, reason: '없는 주소' }
    }
}
const leaderFeed = () => feedOf({ kind: 'website', handleOrUrl: `https://curious-500.com/v2/creator/${W}`, snsSlot: 'curious' })
const mix = (n: number, every = 3): P[] => Array.from({ length: n }, (_, i) => ({ id: 5000 - i, writer: i % every === 0 ? W : 1, at: new Date(Date.UTC(2026, 9, 6, 0, 0) - i * 3_600_000).toISOString().slice(0, 19) }))

const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})
const cur = (...a: Parameters<FetchNewItems>) => sns.curiousFetcher({ sleep })(...a)

describe('큐리어스 = 리더 화면 + 그 리더(writer)가 쓴 공개 커뮤니티 글', () => {
    beforeEach(() => {
        readUrl.mockImplementation(async (url: string) => ({ ok: true, url, requestedUrl: url, title: '박근필 | 큐리어스 리더', text: '[큐리어스 리더] 박근필\n소개 글입니다 '.repeat(5), kind: 'web' }))
    })

    it('리더 번호 = writer 번호. 공개 목록에서 그 사람 글만, 최신순, 본문까지', async () => {
        fetchPageSafely.mockImplementation(curiousApi(mix(30)))
        const r = await cur(leaderFeed(), null, {})
        expect(r.items[0].url).toBe(`https://curious-500.com/v2/creator/${W}`)
        const posts = r.items.slice(1)
        expect(posts.map(p => p.url)).toEqual([5000, 4997, 4994, 4991, 4988, 4985, 4982, 4979, 4976, 4973].map(id => `https://curious-500.com/v2/community/post/${id}`))
        expect(posts[0].text).toContain('본문입니다')
        expect(posts[0].title).toBe('글 5000')
        // 본체에는 GET 만, 공개 창구(/api/v2)만
        expect(fetchPageSafely.mock.calls.every(c => String(c[0]).startsWith('https://curious-500.com/api/v2/'))).toBe(true)
    })

    it('최대 SNS_CURIOUS_MAX_POSTS(30)개, 비공개(published 아님) 글은 뺀다', async () => {
        fetchPageSafely.mockImplementation(curiousApi(mix(200, 1), { status: id => (id === 4999 ? 'hidden' : 'published') }))
        const r = await cur(leaderFeed(), null, {})
        const posts = r.items.slice(1)
        expect(sns.SNS_CURIOUS_MAX_POSTS).toBe(30)
        expect(posts.length).toBeLessThanOrEqual(30)
        expect(posts.some(p => p.url.endsWith('/4999'))).toBe(false)
        expect(r.note).toMatch(/1개.*공개/)
    })

    it('매일 자동: 이미 배운 리더 화면, 글은 건너뛰고 지난번 이후 새 글만', async () => {
        fetchPageSafely.mockImplementation(curiousApi(mix(30)))
        const known = new Set([`https://curious-500.com/v2/creator/${W}`, 'https://curious-500.com/v2/community/post/4997'])
        const since = new Date(Date.UTC(2026, 9, 6, 0, 0) - 10 * 3_600_000 - 9 * 3_600_000)   // 10시간 전 (목록 시각은 꼬리 없는 서울 시각 = 세계 시각으로는 9시간 앞)
        const r = await cur(leaderFeed(), since, { isKnown: u => known.has(u) })
        expect(readUrl).not.toHaveBeenCalled()
        expect(r.items.map(i => i.url)).toEqual(['https://curious-500.com/v2/community/post/5000', 'https://curious-500.com/v2/community/post/4994', 'https://curious-500.com/v2/community/post/4991'])
    })

    it('리더 화면이 아닌 글 주소면 그 글 하나만 (목록을 돌지 않는다)', async () => {
        fetchPageSafely.mockImplementation(curiousApi(mix(30)))
        const r = await cur(feedOf({ kind: 'website', handleOrUrl: 'https://curious-500.com/v2/community/post/2665', snsSlot: 'curious' }), null, {})
        expect(r.items).toHaveLength(1)
        expect(fetchPageSafely).not.toHaveBeenCalled()
    })

    it('글 목록을 못 열어도 리더 화면은 넣고 이유를 남긴다', async () => {
        fetchPageSafely.mockImplementation(async (url: string) => ({ ok: false, requestedUrl: url, reason: '큐리어스가 답하지 않아요' }))
        const r = await cur(leaderFeed(), null, {})
        expect(r.items).toHaveLength(1)
        expect(r.note).toMatch(/커뮤니티 글/)
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
        // 소유 증명 전이라 「내가 쓴 글」로 표시하지 않는다 (보안 검토 PR #53)
        expect(call[6]?.meta).toMatchObject({ sourceKind: 'sns_blog', citationUrl: 'https://blog.naver.com/jin/2230000002', authorIsMe: false })
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

/* ─────────────── 6. 크론 이중 확인, 횟수 열쇠 ─────────────── */
describe('claimFeedForRun = 크론이 줄을 돌기 전에', () => {
    it('먼저 last_synced_at 을 찍고(한 줄이 매일 앞줄을 막지 않게), 주인이 맞으면 true', async () => {
        const fake = makeFakeDb(learnTables())
        const { claimFeedForRun } = await import('../feeds/store')
        expect(await claimFeedForRun(fake.db, feedOf())).toBe(true)
        expect(fake.tables.knowledge_feeds[0].last_synced_at).toBeTruthy()
        expect(fake.tables.knowledge_feeds[0].status).toBe('connected')
    })
    it('연결한 사람이 더는 봇 주인이 아니면 paused 로 멈추고 false', async () => {
        const fake = makeFakeDb(learnTables())
        const { claimFeedForRun } = await import('../feeds/store')
        expect(await claimFeedForRun(fake.db, feedOf({ userId: 'u-other' }))).toBe(false)
        expect(fake.tables.knowledge_feeds[0]).toMatchObject({ status: 'paused' })
        expect(String(fake.tables.knowledge_feeds[0].last_error)).toMatch(/주인/)
    })
})

describe('checkSnsLearnLimits = 배우기 횟수 열쇠 (learn 과 기존 「지금 가져오기」가 같은 열쇠)', () => {
    it('봇 분당 2, 봇 하루 10, 회원 하루 30. 전부 failClosed', async () => {
        const calls: unknown[][] = []
        const check = vi.fn(async (...a: unknown[]) => { calls.push(a.slice(1)); return { allowed: true, remaining: 1 } })
        expect(await sns.checkSnsLearnLimits({} as never, 'u1', 'm1', check)).toBeNull()
        expect(calls).toEqual([
            ['sns-learn:m:m1', 2, 60, { failClosed: true }],
            ['sns-learn:d:m1', 10, 86_400, { failClosed: true }],
            ['sns-learn:u:u1', 30, 86_400, { failClosed: true }],
        ])
        const deny = vi.fn(async (_db: unknown, key: string) => ({ allowed: !key.startsWith('sns-learn:u:'), remaining: 0 }))
        expect(await sns.checkSnsLearnLimits({} as never, 'u1', 'm1', deny)).toMatchObject({ retryAfterSec: 86_400 })
    })
})

/* ─────────────── 7. 본체 공개 창구 부담 줄이기 ─────────────── */
describe('큐리어스 본체 요청 줄이기', () => {
    beforeEach(() => {
        sleep.mockClear()
        readUrl.mockImplementation(async (url: string) => ({ ok: true, url, requestedUrl: url, title: '리더', text: '[큐리어스 리더] 소개 글입니다 '.repeat(5), kind: 'web' }))
    })
    const listCalls = () => fetchPageSafely.mock.calls.filter(c => new URL(String(c[0])).pathname === '/api/v2/posts').length

    it('처음 배우기는 최신 600편(200 × 3쪽)까지만 훑는다', async () => {
        fetchPageSafely.mockImplementation(curiousApi(mix(3000, 1000)))
        await cur(leaderFeed(), null, {})
        expect(sns.SNS_CURIOUS_FIRST_SCAN).toBe(600)
        expect(listCalls()).toBe(3)
    })

    it('매일 자동은 지난번 본 가장 최신 글 번호에 닿으면 바로 멈추고, 새 기준 번호를 돌려준다', async () => {
        fetchPageSafely.mockImplementation(curiousApi(mix(3000)))
        const r = await cur(leaderFeed(), new Date(0), { cursor: '4990', isKnown: u => u.includes('/creator/') })
        expect(listCalls()).toBe(1)
        expect(r.items.map(i => i.url)).toEqual([5000, 4997, 4994, 4991].map(id => `https://curious-500.com/v2/community/post/${id}`))
        expect(r.cursor).toBe('5000')
    })

    it('한 번 배우기당 본체 요청은 최대 40번 (리더 화면 4 + 목록 + 글), 요청 사이 200ms', async () => {
        fetchPageSafely.mockImplementation(curiousApi(mix(600, 20)))
        const r = await cur(leaderFeed(), null, {})
        const calls = fetchPageSafely.mock.calls.length + sns.CURIOUS_LEADER_PAGE_CALLS
        expect(calls).toBeLessThanOrEqual(sns.SNS_CURIOUS_MAX_CALLS)
        expect(sns.SNS_CURIOUS_MAX_CALLS).toBe(40)
        expect(sleep.mock.calls.every(c => c[0] === 200)).toBe(true)
        expect(sleep.mock.calls.length).toBeGreaterThanOrEqual(fetchPageSafely.mock.calls.length - 1)
        expect(r.cursor).toBe('5000')
    })

    it('40번에 닿으면 멈추고 기준 번호는 안 돌려준다(다음에 이어서)', async () => {
        fetchPageSafely.mockImplementation(curiousApi(mix(600, 1)))
        const r = await sns.curiousFetcher({ sleep, maxCalls: 10 })(leaderFeed(), null, {})
        expect(fetchPageSafely.mock.calls.length + sns.CURIOUS_LEADER_PAGE_CALLS).toBeLessThanOrEqual(10)
        expect(r.cursor).toBeUndefined()
        expect(r.note).toMatch(/다음에/)
    })

    it('하루 전체 본체 요청 상한에 닿으면 멈추고 다음 날로', async () => {
        fetchPageSafely.mockImplementation(curiousApi(mix(600, 1)))
        let n = 0
        const r = await sns.curiousFetcher({ sleep, allowCall: async () => ++n <= 6 })(leaderFeed(), null, {})
        expect(fetchPageSafely.mock.calls.length).toBeLessThanOrEqual(2)
        expect(r.cursor).toBeUndefined()
        expect(r.note).toMatch(/내일/)
    })

    it('하루 상한은 모든 봇 합쳐 한 열쇠(curious-api:day, 2,000번, 셀 수 없으면 막음)', async () => {
        const calls: unknown[][] = []
        const allow = sns.curiousDailyAllow({} as never, async (...a: unknown[]) => { calls.push(a.slice(1)); return { allowed: true, remaining: 1 } })
        expect(await allow()).toBe(true)
        expect(calls[0]).toEqual(['curious-api:day', 2_000, 86_400, { failClosed: true }])
    })
})

describe('syncFeed 가 기준 번호(sync_cursor)를 저장하는 때', () => {
    it('가져온 글을 전부 넣었을 때만 저장한다', async () => {
        const { syncFeed } = await import('../feeds/sync')
        const ok = makeFakeDb(learnTables())
        wireAdd(ok.tables)
        const item = { title: '글', url: 'https://curious-500.com/v2/community/post/1', text: '본문입니다 '.repeat(10) }
        await syncFeed(ok.db, feedOf({ kind: 'website' }), { fetchers: { website: async () => ({ items: [item], cursor: '99' }) } })
        expect(ok.tables.knowledge_feeds[0].sync_cursor).toBe('99')

        const bad = makeFakeDb(learnTables())
        addKnowledgeSource.mockRejectedValue(new Error('넣기 실패'))
        await syncFeed(bad.db, feedOf({ kind: 'website' }), { fetchers: { website: async () => ({ items: [item], cursor: '99' }) } })
        expect(bad.tables.knowledge_feeds[0].sync_cursor).toBeUndefined()
    })

    it('연결 줄의 기준 번호를 가져오기에 넘긴다', async () => {
        const { syncFeed } = await import('../feeds/sync')
        const fake = makeFakeDb(learnTables())
        let seen: unknown
        await syncFeed(fake.db, feedOf({ kind: 'website', syncCursor: '42' }), { fetchers: { website: async (_f, _s, o) => { seen = o?.cursor; return { items: [] } } } })
        expect(seen).toBe('42')
    })
})

describe('큐리어스 글은 공개 표시가 확실할 때만 (보안 재검토)', () => {
    beforeEach(() => {
        readUrl.mockImplementation(async (url: string) => ({ ok: true, url, requestedUrl: url, title: '리더', text: '[큐리어스 리더] 소개 글입니다 '.repeat(5), kind: 'web' }))
    })
    it('status 가 없거나 published 가 아니면 뺀다', async () => {
        fetchPageSafely.mockImplementation(curiousApi(mix(4, 1), { status: id => (id === 5000 ? undefined : id === 4999 ? 'draft' : 'published') }))
        const r = await cur(leaderFeed(), null, {})
        expect(r.items.filter(i => i.url.includes('/post/')).map(i => i.url.split('/').pop())).toEqual(['4998', '4997'])
    })
    it('회원 전용, 멤버십 표시 칸이 있으면 공개일 때만', async () => {
        const extra = (id: number): Record<string, unknown> => ({
            5000: { isMemberOnly: true }, 4999: { membershipId: 12 }, 4998: { visibility: 'MEMBERS' }, 4997: { isPublic: false },
            4996: { isSecret: true }, 4995: { visibility: 'PUBLIC', isMemberOnly: false, membershipId: null, isPublic: true },
        }[id] ?? {})
        fetchPageSafely.mockImplementation(curiousApi(mix(7, 1), { extra }))
        const r = await cur(leaderFeed(), null, {})
        expect(r.items.filter(i => i.url.includes('/post/')).map(i => i.url.split('/').pop())).toEqual(['4995', '4994'])
    })
    it('isCuriousPostPublic = 실제 응답 모양(1006 GET 확인: status, writerInfo, …)은 공개', () => {
        expect(sns.isCuriousPostPublic({ id: 2788, status: 'published', writerInfo: { writerId: 30 }, isOwner: false, postCategoryNumber: 9 })).toBe(true)
        expect(sns.isCuriousPostPublic({ id: 1 })).toBe(false)
        expect(sns.isCuriousPostPublic({ status: 'published', accessLevel: 'member' })).toBe(false)
    })
})

describe('syncFeed 끝부분 모르는 오류는 일반 문구', () => {
    it('DB 고장 원문을 연결 줄, 결과에 남기지 않는다', async () => {
        const { syncFeed, SYNC_FAIL_NOTE } = await import('../feeds/sync')
        const fake = makeFakeDb(learnTables())
        const orig = fake.db.from.bind(fake.db)
        ;(fake.db as unknown as { from: (t: string) => unknown }).from = (t: string) => {
            if (t === 'knowledge_sources') throw new Error('relation "knowledge_sources_secret" permission denied')
            return orig(t)
        }
        const r = await syncFeed(fake.db, feedOf({ kind: 'website' }), { fetchers: { website: async () => ({ items: [] }) } })
        expect(r.lastError).toBe(SYNC_FAIL_NOTE)
        expect(JSON.stringify(fake.tables.knowledge_feeds[0])).not.toContain('secret')
    })
})

/* ─────────────── 인스타그램 (로그인 연결, 1007) ─────────────── */
describe('인스타그램 칸 배우기 (로그인 연결이 있을 때만)', () => {
    const key = randomBytes(32)
    const env = {
        INSTAGRAM_APP_ID: '1', INSTAGRAM_APP_SECRET: 's', INSTAGRAM_REDIRECT_URI: 'https://www.curi-ai.com/api/sns/instagram/callback',
        CONNECTOR_SECRET_KEY: key.toString('base64'),
    }
    const igFeed = (over: Partial<KnowledgeFeed> = {}) => feedOf({ id: 'feed-ig', kind: 'instagram', handleOrUrl: 'https://www.instagram.com/jin.ceo/', snsSlot: 'instagram', ...over })
    async function tables() {
        const t = ownerTables()
        t.knowledge_feeds.push({ id: 'feed-ig', mentor_id: 'm-1', user_id: 'u-owner', kind: 'instagram', handle_or_url: 'https://www.instagram.com/jin.ceo/', status: 'connected', created_at: '2026-10-01T00:00:00Z', sns_slot: 'instagram' })
        const { encryptSecret } = await import('@/domains/connectors/crypto')
        const { igTokenKey } = await import('../instagram/core')
        ;(t as Record<string, Record<string, unknown>[]>).instagram_connections = [{ mentor_id: 'm-1', user_id: 'u-owner', status: 'connected', username: 'jin.ceo', token_encrypted: encryptSecret('IGT', igTokenKey(key)), token_expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() }]
        return t
    }
    const media = { data: [
        { id: '2', caption: '오늘은 새벽 운동 루틴을 소개할게요. 5시 기상 후 스트레칭', media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/B2/', timestamp: '2026-10-02T00:00:00+0000' },
        { id: '1', caption: '짧다', media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/A1/', timestamp: '2026-10-01T00:00:00+0000' },
    ] }

    it('기능이 꺼져 있으면 예전처럼 「곧 열려요」(밖에 안 나간다)', async () => {
        const fake = makeFakeDb(await tables())
        const f = vi.fn()
        vi.stubGlobal('fetch', f)
        const r = await sns.syncSnsFeed(fake.db, igFeed())
        expect(r.note).toBe(sns.INSTAGRAM_COMING_SOON)
        expect(f).not.toHaveBeenCalled()
        vi.unstubAllGlobals()
    })

    it('켜져 있으면 내 게시물 글만 [인스타그램] 자료로, 지금 배우기에도 들어간다', async () => {
        for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
        const fake = makeFakeDb(await tables())
        wireAdd(fake.tables)
        vi.stubGlobal('fetch', vi.fn(async (u: string) => {
            expect(new URL(u).searchParams.get('access_token')).toBe('IGT')
            return new Response(JSON.stringify(media))
        }))
        const out = await sns.learnBotSns(fake.db, { mentorId: 'm-1' })
        const ig = out.find(o => o.slot === 'instagram')
        expect(ig).toMatchObject({ ok: true, added: 1 })
        const call = addKnowledgeSource.mock.calls[0]
        expect(call[2]).toMatch(/^\[인스타그램\] 오늘은 새벽 운동/)
        expect(call[5]).toBe('https://www.instagram.com/p/B2/')
        expect(call[6]?.meta).toMatchObject({ sourceKind: 'sns_instagram', authorIsMe: false })
        expect(fake.tables.knowledge_feeds.find(f => f.id === 'feed-ig')?.sync_cursor).toBe('2026-10-02T00:00:00.000Z')
        vi.unstubAllGlobals(); vi.unstubAllEnvs()
    })

    it('끊은 연결(paused)은 지금 배우기에서 건너뛴다', async () => {
        for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
        const t = await tables()
        t.knowledge_feeds[0].status = 'paused'
        const fake = makeFakeDb(t)
        const f = vi.fn()
        vi.stubGlobal('fetch', f)
        expect((await sns.learnBotSns(fake.db, { mentorId: 'm-1' })).find(o => o.slot === 'instagram')).toBeUndefined()
        expect(f).not.toHaveBeenCalled()
        vi.unstubAllGlobals(); vi.unstubAllEnvs()
    })
})
