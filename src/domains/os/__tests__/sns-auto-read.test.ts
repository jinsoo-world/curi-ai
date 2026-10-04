// 인스타그램, 스레드 자동 읽기 (0929): 공개 계정은 주소만으로 자료 저장 + 보너스, 못 읽으면 캡처/붙여넣기. 인터넷, DB 는 가짜.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const readUrl = vi.fn()
const addKnowledgeSource = vi.fn(async () => ({ id: 'src1' }))
const addLinkSource = vi.fn(async () => ({ id: 'link1' }))
vi.mock('../readers', () => ({ readUrl: (...a: unknown[]) => readUrl(...a), KNOWLEDGE_READ_OPTIONS: { maxBytes: 1, timeoutMs: 45_000, maxChars: 100_000 } }))
vi.mock('@/domains/knowledge', () => ({ addKnowledgeSource: (...a: unknown[]) => addKnowledgeSource(...(a as [])) }))
vi.mock('../knowledge', async orig => ({ ...(await orig<typeof import('../knowledge')>()), MAX_SOURCES_PER_BOT: 50, addTextSource: vi.fn(), assertRoomForMore: vi.fn(async () => {}), addLinkSource: (...a: unknown[]) => addLinkSource(...(a as [])) }))
vi.mock('../team', () => ({ bootstrapDefaultTeam: vi.fn(async () => ({ team: [{ mentorId: 'bot1', oneLiner: 'x' }] })) }))
vi.mock('../screenshot-read', () => ({ parseScreenshotImages: () => [], readScreenshots: vi.fn(async () => []) }))

import { connectSnsLink } from '../sns-link'
import { addSnsCaptureSource } from '../sns-capture'
import { classifyUrl } from '../readers/router'

function fakeDb(rpcBalance: number | null) {
    const rpc = vi.fn(async () => ({ data: rpcBalance, error: null }))
    const chain: Record<string, unknown> = {}
    for (const k of ['upsert', 'select', 'update', 'eq']) chain[k] = () => chain
    chain.single = async () => ({ data: { id: 'l1', added_count: 0 }, error: null })
    chain.maybeSingle = async () => ({ data: null, error: null })
    return { db: { from: () => chain, rpc } as never, rpc }
}

beforeEach(() => { readUrl.mockReset(); addKnowledgeSource.mockClear(); addLinkSource.mockClear() })

describe('classifyUrl', () => {
    it('인스타그램, 스레드 주소를 알아본다', () => {
        expect(classifyUrl('https://www.instagram.com/me/')).toBe('instagram')
        expect(classifyUrl('https://www.threads.net/@me')).toBe('threads')
        expect(classifyUrl('https://www.threads.com/@me')).toBe('threads')
    })
})

describe('connectSnsLink 인스타그램, 스레드', () => {
    it('공개 계정 = 자동으로 읽어 저장하고 보너스를 준다', async () => {
        readUrl.mockResolvedValue({ ok: true, url: 'u', requestedUrl: 'u', title: '인스타그램', text: '오늘 강의에서 나눈 이야기를 정리해 봤어요. 아주 길게 써서 서른 글자를 넘깁니다. 수강생들이 가장 많이 물어본 것은 시작하는 방법이었습니다.', kind: 'web' })
        const { db, rpc } = fakeDb(150)
        const r = await connectSnsLink(db, { userId: 'u1', displayName: '진', url: 'https://www.instagram.com/me/', source: 'onboarding' })
        console.log(JSON.stringify(r)); expect(r.status).toBe('read')
        expect(r.bonus).toBe(50)
        expect(addKnowledgeSource).toHaveBeenCalledOnce()
        expect(rpc).toHaveBeenCalledWith('grant_sns_link_bonus_keyed', expect.objectContaining({ p_key: 'instagram:instagram.com/me' }))
    })
    it('같은 주소를 다른 계정이 이미 받았으면 보너스 없음', async () => {
        readUrl.mockResolvedValue({ ok: true, url: 'u', requestedUrl: 'u', title: '스레드', text: '스레드에 올린 글 하나를 여기 적어 둡니다. 충분히 길게 써서 서른 글자를 넘깁니다. 오늘은 아침 루틴에 대해 적었습니다.', kind: 'web' })
        const { db } = fakeDb(-1)
        const r = await connectSnsLink(db, { userId: 'u2', displayName: '진', url: 'https://www.threads.net/@me', source: 'settings' })
        expect(r.bonus).toBe(0)
        expect(r.keyTaken).toBe(true)
    })
    it('비공개(못 읽음) = 저장도 보너스도 없이 캡처/붙여넣기로', async () => {
        readUrl.mockResolvedValue({ ok: false, requestedUrl: 'u', reason: '공개된 게시물 글을 찾지 못했어요' })
        const { db, rpc } = fakeDb(150)
        readUrl.mockResolvedValue({ ok: false, requestedUrl: 'u', reason: '인스타그램에서 글을 읽지 못했어요. 비공개 계정이거나 주소가 달라요', code: 'not_public' })
        const r = await connectSnsLink(db, { userId: 'u1', displayName: '진', url: 'https://www.instagram.com/secret/', source: 'onboarding' })
        expect(r.status).toBe('paste')
        expect(r.code).toBeTruthy()          // 이유 갈래를 화면에 알린다 (조용히 버리지 않는다)
        expect(r.message).toMatch(/\S/)
        expect(r.retry).toBeDefined()
        expect(r.bonus).toBe(0)
        expect(addKnowledgeSource).not.toHaveBeenCalled()
        expect(rpc).not.toHaveBeenCalled()
    })
})

describe('addSnsCaptureSource 주소만', () => {
    it('인스타그램 주소만 넣으면 자동 읽기로 넘긴다', async () => {
        await addSnsCaptureSource({} as never, 'bot1', { url: 'instagram.com/me' })
        expect(addLinkSource).toHaveBeenCalledWith({}, 'bot1', 'https://instagram.com/me', { userId: undefined })
    })
    it('페이스북 주소만이면 캡처/붙여넣기를 부탁한다', async () => {
        await expect(addSnsCaptureSource({} as never, 'bot1', { url: 'https://facebook.com/me' })).rejects.toThrow(/캡처/)
    })
})
