// 링크로 만든 봇의 자료 = 초안이 읽은 것과 같게 (1003). 인터넷, DB, 임베딩은 가짜.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const readUrl = vi.fn()
const addKnowledgeSource = vi.fn<(...a: unknown[]) => Promise<{ id: string }>>(async () => ({ id: 'src1' }))
const fetchYoutube = vi.fn()
const fetchPodcast = vi.fn()
const fetchWebsite = vi.fn()
vi.mock('../readers', () => ({ readUrl: (...a: unknown[]) => readUrl(...a), KNOWLEDGE_READ_OPTIONS: { maxBytes: 1, timeoutMs: 45_000, maxChars: 100_000 } }))
vi.mock('@/domains/knowledge', () => ({ addKnowledgeSource: (...a: unknown[]) => addKnowledgeSource(...a) }))
vi.mock('../feeds', () => ({
    FETCHERS: {
        youtube: (...a: unknown[]) => fetchYoutube(...a),
        podcast: (...a: unknown[]) => fetchPodcast(...a),
        substack: (...a: unknown[]) => fetchPodcast(...a),
        website: (...a: unknown[]) => fetchWebsite(...a),
    },
}))

import { addDraftSources } from '../knowledge'

function fakeDb(existingUrls: string[] = []) {
    const from = () => {
        const chain: Record<string, unknown> = {}
        for (const op of ['select', 'eq', 'or', 'in', 'order', 'limit']) chain[op] = () => chain
        chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ count: 0, data: existingUrls.map(u => ({ original_url: u })), error: null }).then(ok)
        return chain
    }
    return { from } as never
}

const long = (s: string) => `${s} `.repeat(8)
const kinds = () => addKnowledgeSource.mock.calls.map(c => (c[6] as { meta?: { sourceKind?: string } } | undefined)?.meta?.sourceKind)

beforeEach(() => { readUrl.mockReset(); addKnowledgeSource.mockClear(); fetchYoutube.mockReset(); fetchPodcast.mockReset(); fetchWebsite.mockReset() })

describe('addDraftSources: 소스별로 초안과 같은 길로 읽어 편마다 저장', () => {
    it('네이버 블로그 첫 화면 = 공개 RSS 최근 글을 편마다 (제목, 주소, 날짜)', async () => {
        fetchPodcast.mockResolvedValue({ items: [
            { title: '첫 글', url: 'https://blog.naver.com/me/1', text: long('퇴사하고 첫 강의를 열었어요.'), publishedAt: '2026-09-01T00:00:00.000Z' },
            { title: '둘째 글', url: 'https://blog.naver.com/me/2', text: long('수강생 37명과 함께했어요.'), publishedAt: '2026-09-02T00:00:00.000Z' },
        ] })
        const r = await addDraftSources(fakeDb(), 'm1', { links: ['https://blog.naver.com/me'], pastes: [] })
        expect(r).toEqual({ added: 2, failed: 0, failures: [] })
        expect(fetchPodcast.mock.calls[0][0]).toMatchObject({ kind: 'podcast', handleOrUrl: 'https://rss.blog.naver.com/me.xml' })
        expect(readUrl).not.toHaveBeenCalled()
        const first = addKnowledgeSource.mock.calls[0]
        expect(first[2]).toBe('첫 글')
        expect(first[4]).toBe('url')
        expect(first[5]).toBe('https://blog.naver.com/me/1')
        expect(first[6]).toMatchObject({ meta: { sourceKind: 'blog' }, ingest: { publishedAt: '2026-09-01T00:00:00.000Z', dedupe: true } })
    })

    it('유튜브 채널 = 최근 영상을 편마다 유튜브 자료로', async () => {
        fetchYoutube.mockResolvedValue({ items: [{ title: '영상 1', url: 'https://www.youtube.com/watch?v=abc', text: long('[0:00] 안녕하세요 영상입니다.') }] })
        await addDraftSources(fakeDb(), 'm1', { links: ['https://www.youtube.com/@curi'], pastes: [] })
        expect(fetchYoutube).toHaveBeenCalledTimes(1)
        expect(addKnowledgeSource.mock.calls[0][4]).toBe('youtube')
        expect(kinds()).toEqual(['youtube'])
    })

    it('인스타그램, 스레드 공개 계정도 저장한다 (예전엔 버렸다)', async () => {
        readUrl.mockResolvedValue({ ok: true, url: 'https://www.instagram.com/me/', title: '인스타그램', text: long('오늘 수업 후기예요.'), kind: 'web' })
        const r = await addDraftSources(fakeDb(), 'm1', { links: ['https://www.instagram.com/me/', 'https://www.threads.net/@me'], pastes: [] })
        expect(r.added).toBe(2)
        expect(kinds().sort()).toEqual(['instagram', 'threads'])
        expect(addKnowledgeSource.mock.calls[0][3]).toContain('출처: https://www.instagram.com/me/')
    })

    it('블로그 글 하나 주소는 그 글만 읽는다', async () => {
        readUrl.mockResolvedValue({ ok: true, url: 'https://blog.naver.com/me/223456789', title: '그 글', text: long('글 본문입니다.'), kind: 'web' })
        await addDraftSources(fakeDb(), 'm1', { links: ['https://blog.naver.com/me/223456789'], pastes: [] })
        expect(fetchPodcast).not.toHaveBeenCalled()
        expect(readUrl.mock.calls[0][0]).toBe('https://blog.naver.com/me/223456789')
    })

    it('이미 자료로 있는 주소는 다시 넣지 않는다 (가져오기에 isKnown 을 넘긴다)', async () => {
        fetchPodcast.mockImplementation(async (_f: unknown, _s: unknown, opts: { isKnown: (u: string) => boolean }) => ({
            items: [{ title: 'a', url: 'https://blog.naver.com/me/1', text: long('본문') }].filter(i => !opts.isKnown(i.url)),
        }))
        const r = await addDraftSources(fakeDb(['https://blog.naver.com/me/1']), 'm1', { links: ['https://blog.naver.com/me'], pastes: [] })
        expect(r.added).toBe(0)
        expect(addKnowledgeSource).not.toHaveBeenCalled()
    })

    it('가져오기가 고장 나도 던지지 않고 실패로 센다', async () => {
        fetchPodcast.mockRejectedValue(new Error('RSS 를 못 열었어요'))
        const r = await addDraftSources(fakeDb(), 'm1', { links: ['https://me.tistory.com'], pastes: ['붙여넣은 글이 충분히 길어요. 서른 글자를 넘기려고 조금 더 길게 적었습니다.'] })
        expect(r.added).toBe(1)
        expect(r.failed).toBe(1)
        expect(r.failures[0]).toMatchObject({ url: 'https://me.tistory.com' })   // 못 읽은 링크는 이유와 함께 돌려준다
    })
})
