// 그룹방 응답(members)에 봇 지시문(systemPrompt)이 실려 나가지 않는다
// 방 멤버엔 마켓에서 데려온 남의 봇도 있다. 지시문은 서버 안에서 답을 만들 때만 쓴다.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const BOTS = [
    { mentorId: 'm1', name: '내 봇', systemPrompt: '내 지시문', oneLiner: null, shape: 'circle', color: 'green', avatarUrl: null },
    { mentorId: 'm2', name: '남의 봇', systemPrompt: '남의 비밀 지시문', oneLiner: '한 줄', shape: 'hex', color: 'blue', avatarUrl: 'https://x/a.png' },
]

let user: { id: string } | null = { id: 'u1' }
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: async () => ({ data: [], error: null }) }) }))
vi.mock('@/domains/os/blocks', () => ({
    listBlockedMentorIds: async () => new Set<string>(),
    withoutBlocked: <T,>(xs: T[]) => xs,
}))
vi.mock('@/domains/os/channels', async (orig) => {
    const real = await orig<typeof import('@/domains/os/channels')>()
    const channel = { id: 'c1', name: '팀', kind: 'group', memberMentorIds: ['m1', 'm2'], createdAt: '2026-10-01T00:00:00Z' }
    return {
        ...real,
        listChannels: async () => [channel],
        getChannel: async () => channel,
        getChannelBots: async () => BOTS.map(b => ({ ...b })),
        listChannelMessages: async () => [],
        addChannelMembers: async () => ['m1', 'm2'],
        removeChannelMembers: async () => ['m1', 'm2'],
    }
})

import { toClientBot } from '@/domains/os/channels'
import { GET as listGET } from '@/app/api/os/channels/route'
import { GET as oneGET, PATCH as onePATCH } from '@/app/api/os/channels/[id]/route'

const ctx = { params: Promise.resolve({ id: 'c1' }) }

beforeEach(() => { user = { id: 'u1' } })

describe('그룹방 응답 — 지시문 빼기', () => {
    it('toClientBot 은 systemPrompt 만 빼고 나머지는 그대로', () => {
        const out = toClientBot(BOTS[1])
        expect(out).toEqual({ mentorId: 'm2', name: '남의 봇', oneLiner: '한 줄', shape: 'hex', color: 'blue', avatarUrl: 'https://x/a.png' })
        expect('systemPrompt' in out).toBe(false)
    })

    it('GET /api/os/channels 목록', async () => {
        const body = await (await listGET()).json()
        expect(body.channels[0].members).toHaveLength(2)
        expect(JSON.stringify(body)).not.toContain('지시문')
        expect(JSON.stringify(body)).not.toContain('systemPrompt')
    })

    it('GET /api/os/channels/[id] 방 하나', async () => {
        const body = await (await oneGET(new Request('http://x'), ctx)).json()
        expect(body.members.map((m: { name: string }) => m.name)).toEqual(['내 봇', '남의 봇'])
        expect(JSON.stringify(body)).not.toContain('지시문')
    })

    it('PATCH /api/os/channels/[id] 멤버 바꾸기', async () => {
        const req = new Request('http://x', { method: 'PATCH', body: JSON.stringify({ addMentorIds: ['m2'] }) })
        const body = await (await onePATCH(req, ctx)).json()
        expect(body.members).toHaveLength(2)
        expect(JSON.stringify(body)).not.toContain('지시문')
    })
})
