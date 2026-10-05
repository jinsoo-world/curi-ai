// 블로그 확장 연결 흐름 (대표 승인 1005 11:27): 인터넷, DB 는 가짜. 읽기 성공 = 저장 + 보너스, 실패 = 이유 + 다시 시도 + 붙여넣기 칸
import { describe, it, expect, vi, beforeEach } from 'vitest'

const readUrl = vi.fn()
const addKnowledgeSource = vi.fn(async (..._a: unknown[]) => ({ id: 'src1' }))
const detectBlogKind = vi.fn(async (_u: string): Promise<'post' | 'account'> => 'account')
const syncFeed = vi.fn()
const createFeed = vi.fn(async (_db: unknown, a: { kind: string; handleOrUrl: string }) => ({ id: 'feed1', mentorId: 'bot1', ...a }))
vi.mock('../readers', () => ({ readUrl: (...a: unknown[]) => readUrl(...a), KNOWLEDGE_READ_OPTIONS: { maxBytes: 1, timeoutMs: 45_000, maxChars: 100_000 } }))
vi.mock('@/domains/knowledge', () => ({ addKnowledgeSource: (...a: unknown[]) => addKnowledgeSource(...a) }))
vi.mock('../knowledge', async orig => ({ ...(await orig<typeof import('../knowledge')>()), addTextSource: vi.fn(), assertRoomForMore: vi.fn(async () => {}), addLinkSource: vi.fn() }))
vi.mock('../team', () => ({ bootstrapDefaultTeam: vi.fn(async () => ({ team: [{ mentorId: 'bot1', oneLiner: 'x' }] })) }))
vi.mock('../screenshot-read', () => ({ parseScreenshotImages: () => [], readScreenshots: vi.fn(async () => []) }))
vi.mock('../feeds/blog', async orig => ({ ...(await orig<typeof import('../feeds/blog')>()), detectBlogKind: (u: string) => detectBlogKind(u) }))
vi.mock('../feeds', async orig => ({
    ...(await orig<typeof import('../feeds')>()),
    listFeeds: vi.fn(async () => []),
    loadExistingSources: vi.fn(async () => ({ count: 0, urls: new Set(), perKey: new Map() })),
    createFeed: (...a: [unknown, { kind: string; handleOrUrl: string }]) => createFeed(...a),
    syncFeed: (...a: unknown[]) => syncFeed(...a),
}))

import { connectSnsLink } from '../sns-link'
import { SNS_NO_READ_LINE } from '../onboarding'

function fakeDb(rpcBalance: number | null = 150) {
    const rpc = vi.fn(async () => ({ data: rpcBalance, error: null }))
    const updates: Record<string, unknown>[] = []
    const chain: Record<string, unknown> = {}
    for (const k of ['upsert', 'select', 'eq']) chain[k] = () => chain
    chain.update = (v: Record<string, unknown>) => { updates.push(v); return chain }
    chain.single = async () => ({ data: { id: 'l1', added_count: 0 }, error: null })
    chain.maybeSingle = async () => ({ data: null, error: null })
    return { db: { from: () => chain, rpc } as never, rpc, updates }
}
const me = { userId: 'u1', displayName: '진', source: 'settings' as const }
const article = '오늘은 새 블로그 글을 적어 봅니다. 아주 길게 써서 서른 글자를 넘깁니다. 읽는 분께 도움이 되면 좋겠어요.'

beforeEach(() => { readUrl.mockReset(); addKnowledgeSource.mockClear(); syncFeed.mockReset(); createFeed.mockClear(); detectBlogKind.mockClear(); detectBlogKind.mockResolvedValue('account') })

describe('X, 링크드인 = 읽지 않고 붙여넣기 안내만', () => {
    for (const url of ['https://x.com/me', 'https://www.linkedin.com/in/me']) {
        it(url, async () => {
            const { db, rpc, updates } = fakeDb()
            const r = await connectSnsLink(db, { ...me, url })
            expect(r.status).toBe('paste')
            expect(r.message).toBe(SNS_NO_READ_LINE)
            expect(r.code).toBe('paste')
            expect(r.retry).toBe(false)
            expect(r.bonus).toBe(0)
            expect(readUrl).not.toHaveBeenCalled()
            expect(syncFeed).not.toHaveBeenCalled()
            expect(addKnowledgeSource).not.toHaveBeenCalled()
            expect(rpc).not.toHaveBeenCalled()
            expect(updates.some(u => u.status === 'pending')).toBe(true)
        })
    }
})

describe('블로그 글 하나 주소', () => {
    it('미디엄 글 하나: 그 글만 읽어 글 제목으로 저장하고 보너스 (열쇠는 계정)', async () => {
        readUrl.mockResolvedValue({ ok: true, url: 'u', requestedUrl: 'u', title: '내 첫 글', text: article, kind: 'web' })
        const { db, rpc } = fakeDb()
        const r = await connectSnsLink(db, { ...me, url: 'https://medium.com/@me/first-post-62edea66ffa4' })
        expect(r.status).toBe('read')
        expect(r.added).toBe(1)
        expect(r.bonus).toBe(50)
        expect(readUrl).toHaveBeenCalledWith('https://medium.com/@me/first-post-62edea66ffa4', expect.objectContaining({ single: true }))
        expect(addKnowledgeSource.mock.calls[0][2]).toBe('내 첫 글')
        expect(addKnowledgeSource.mock.calls[0][6]).toMatchObject({ ingest: { dedupe: true } })
        expect(syncFeed).not.toHaveBeenCalled()
        expect(rpc).toHaveBeenCalledWith('grant_sns_link_bonus_keyed', expect.objectContaining({ p_key: 'medium:@me' }))
        expect(r.summary).toContain('미디엄')
    })
    it('브런치 글 하나 주소도 그 글만', async () => {
        readUrl.mockResolvedValue({ ok: true, url: 'u', requestedUrl: 'u', title: '브런치 글', text: article, kind: 'web' })
        const { db } = fakeDb()
        const r = await connectSnsLink(db, { ...me, url: 'https://brunch.co.kr/@me/12' })
        expect(r.status).toBe('read')
        expect(syncFeed).not.toHaveBeenCalled()
        expect(readUrl).toHaveBeenCalledTimes(1)
    })
    it('일반 사이트 주소가 글 하나로 보이면 사이트 전체를 돌지 않고 그 글만', async () => {
        detectBlogKind.mockResolvedValue('post')
        readUrl.mockResolvedValue({ ok: true, url: 'u', requestedUrl: 'u', title: '글', text: article, kind: 'web' })
        const { db } = fakeDb()
        const r = await connectSnsLink(db, { ...me, url: 'https://myblog.example.com/2026/10/05/hello-world' })
        expect(r.status).toBe('read')
        expect(syncFeed).not.toHaveBeenCalled()
        expect(r.summary).toContain('myblog.example.com')
    })
    it('너무 짧은 글, 못 읽은 글은 이유와 붙여넣기 (보너스 없음)', async () => {
        const { db, rpc } = fakeDb()
        readUrl.mockResolvedValue({ ok: true, url: 'u', requestedUrl: 'u', title: '짧다', text: '짧아요', kind: 'web' })
        const short = await connectSnsLink(db, { ...me, url: 'https://brunch.co.kr/@me/13' })
        expect(short.status).toBe('paste')
        expect(short.code).toBe('empty')
        expect(short.retry).toBe(true)
        readUrl.mockResolvedValue({ ok: false, requestedUrl: 'u', reason: '미디엄에서 글 읽기를 막고 있어요. 다시 시도하거나 글을 붙여넣어 주세요', code: 'blocked' })
        const blocked = await connectSnsLink(db, { ...me, url: 'https://medium.com/@me/x-62edea66ffa4' })
        expect(blocked.status).toBe('paste')
        expect(blocked.code).toBe('blocked')
        expect(blocked.retry).toBe(true)
        expect(blocked.bonus).toBe(0)
        expect(rpc).not.toHaveBeenCalled()
        expect(addKnowledgeSource).not.toHaveBeenCalled()
    })
})

describe('블로그 계정, 목록 주소', () => {
    it('일반 사이트 목록: 읽은 글 수를 한 줄로, 보너스', async () => {
        syncFeed.mockResolvedValue({ ok: true, added: 7, skipped: 0, failed: 0, status: 'connected', lastError: null })
        const { db } = fakeDb()
        const r = await connectSnsLink(db, { ...me, url: 'https://myblog.example.com/' })
        expect(r.status).toBe('read')
        expect(r.added).toBe(7)
        expect(r.summary).toBe('myblog.example.com 글 7개를 읽었어요')
        expect(createFeed.mock.calls[0][1]).toMatchObject({ kind: 'website', handleOrUrl: 'https://myblog.example.com/' })
    })
    it('미디엄 계정: 공식 RSS 주소로 연결', async () => {
        syncFeed.mockResolvedValue({ ok: true, added: 3, skipped: 0, failed: 0, status: 'connected', lastError: null })
        const { db, rpc } = fakeDb()
        const r = await connectSnsLink(db, { ...me, url: 'https://medium.com/@me' })
        expect(r.status).toBe('read')
        expect(createFeed.mock.calls[0][1]).toMatchObject({ kind: 'podcast', handleOrUrl: 'https://medium.com/feed/@me' })
        expect(rpc).toHaveBeenCalledWith('grant_sns_link_bonus_keyed', expect.objectContaining({ p_key: 'medium:@me' }))
    })
    it('못 읽으면 이유 + 다시 시도 가능 여부 + 붙여넣기 칸 (일반 사이트, 워드프레스닷컴, 미디엄, 브런치)', async () => {
        for (const url of ['https://myblog.example.com/', 'https://myblog.wordpress.com', 'https://medium.com/@me', 'https://brunch.co.kr/@me']) {
            syncFeed.mockResolvedValue({ ok: false, added: 0, skipped: 0, failed: 0, status: 'error', lastError: '글 목록을 찾지 못했어요. 글 주소를 하나씩 넣거나 글을 붙여넣어 주세요', note: '글 목록을 찾지 못했어요. 글 주소를 하나씩 넣거나 글을 붙여넣어 주세요' })
            const { db, rpc } = fakeDb()
            const r = await connectSnsLink(db, { ...me, url })
            expect(r.status, url).toBe('paste')
            expect(r.message, url).toMatch(/붙여넣/)
            expect(r.code, url).toBeTruthy()
            expect(r.retry, url).toBeDefined()
            expect(r.bonus).toBe(0)
            expect(rpc).not.toHaveBeenCalled()
        }
    })
})
