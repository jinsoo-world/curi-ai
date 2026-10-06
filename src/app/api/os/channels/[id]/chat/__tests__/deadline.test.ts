// 단체방 — 사람 말 먼저 저장, 봇별 답에 마감, 55초가 가까우면 남은 봇은 건너뛰고 「잠시 뒤 이어서」 (2026-10-06)
import { describe, it, expect, vi, beforeEach } from 'vitest'

const BOTS = [
    { mentorId: 'm1', name: '하나', systemPrompt: 'a', oneLiner: null, shape: 'circle', color: 'green', avatarUrl: null },
    { mentorId: 'm2', name: '둘', systemPrompt: 'b', oneLiner: null, shape: 'circle', color: 'blue', avatarUrl: null },
    { mentorId: 'm3', name: '셋', systemPrompt: 'c', oneLiner: null, shape: 'circle', color: 'red', avatarUrl: null },
]
const log: string[] = []
const time = { remaining: 55_000, perBot: 0 }
const askOpts: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/domains/os/usage-db', () => ({ readUsage: async () => ({ blocked: false, resetAt: new Date() }) }))
vi.mock('@/domains/push', () => ({ notifyNative: async () => {}, p025GroupReplied: () => ({}) }))
vi.mock('@/domains/os/blocks', () => ({ listBlockedMentorIds: async () => new Set<string>(), withoutBlocked: <T,>(xs: T[]) => xs }))
vi.mock('@/domains/os/readers', () => ({ readUrlsInText: async () => [], buildLinkPrompt: () => null, linkTextForTurn: () => ({ text: '', fromHistory: false }) }))
vi.mock('@/domains/os/group-stagger', () => ({ GROUP_SERVER_GAP_MS: 0, sleep: async () => {} }))
vi.mock('@/domains/os/group-router', async (orig) => ({
    ...(await orig<object>()),
    routeGroupReply: async () => ['m1', 'm2', 'm3'],
}))
vi.mock('@/domains/chat/deadline', async (orig) => {
    const real = await orig<typeof import('@/domains/chat/deadline')>()
    return {
        ...real,
        createChatDeadline: () => ({ at: 123_456, remaining: () => time.remaining, sideBudget: (cap: number) => Math.min(cap, Math.max(0, time.remaining - 25_000)) }),
    }
})
vi.mock('@/domains/agent/ask', () => ({
    askSolar: async () => null,
    askChat: async (_s: string, _u: string, opts: Record<string, unknown>) => {
        askOpts.push(opts)
        log.push('bot')
        time.remaining -= time.perBot
        return `답${askOpts.length}`
    },
}))
vi.mock('@/domains/os/channels', async (orig) => {
    const real = await orig<typeof import('@/domains/os/channels')>()
    const channel = { id: 'c1', name: '팀', kind: 'group', memberMentorIds: ['m1', 'm2', 'm3'], createdAt: '2026-10-01T00:00:00Z' }
    let n = 0
    return {
        ...real,
        getChannel: async () => channel,
        getChannelBots: async () => BOTS.map(b => ({ ...b })),
        listChannelMessages: async () => [],
        saveChannelMessage: async (_db: unknown, _id: string, m: { authorKind: string; mentorId?: string; content: string }) => {
            log.push(`save:${m.authorKind}`)
            n += 1
            return { id: `x${n}`, authorKind: m.authorKind, mentorId: m.mentorId ?? null, content: m.content, createdAt: '' }
        },
    }
})

import { POST } from '../route'

const ctx = { params: Promise.resolve({ id: 'c1' }) }
const call = () => POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ text: '다들 어때?' }) }), ctx)

beforeEach(() => {
    log.length = 0
    askOpts.length = 0
    time.remaining = 55_000
    time.perBot = 0
})

describe('단체방 마감', () => {
    it('사람 말을 봇 답보다 먼저 저장한다', async () => {
        await call()
        expect(log[0]).toBe('save:user')
    })

    it('봇 답에 대화 마감 시각을 넘긴다', async () => {
        await call()
        expect(askOpts[0].deadline).toBe(123_456)
    })

    it('시간이 넉넉하면 고른 봇 모두 답하고 안내는 없다', async () => {
        const body = await (await call()).json()
        expect(body.responderIds).toEqual(['m1', 'm2', 'm3'])
        expect(body.continueLater).toBeUndefined()
    })

    it('마감이 가까워지면 남은 봇은 건너뛰고 「잠시 뒤 이어서」', async () => {
        time.perBot = 40_000   // 첫 봇이 40초를 써서 15초만 남는다 → 다음 봇부터 건너뜀(최소 8초는 남았지만 두 번째 뒤엔 모자람)
        const body = await (await call()).json()
        expect(body.responderIds.length).toBeLessThan(3)
        expect(body.continueLater).toBe(true)
        expect(String(body.notice)).toContain('잠시 뒤 이어서')
    })
})
