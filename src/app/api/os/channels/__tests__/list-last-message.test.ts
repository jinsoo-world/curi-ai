// GET /api/os/channels — last_message_preview·last_message_at 추가, 기존 필드 유지
import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpc = vi.fn()
let user: { id: string } | null = { id: 'u1' }
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }))
vi.mock('@/domains/os/channels', async (orig) => {
    const real = await orig<typeof import('@/domains/os/channels')>()
    return {
        ...real,
        listChannels: async () => [
            { id: 'c1', name: '팀', kind: 'group', memberMentorIds: ['m1', 'm2'], createdAt: '2026-10-01T00:00:00Z' },
            { id: 'c2', name: '빈방', kind: 'group', memberMentorIds: ['m1', 'm2'], createdAt: '2026-10-02T00:00:00Z' },
        ],
        getChannelBots: async () => [],
    }
})

import { GET } from '@/app/api/os/channels/route'

beforeEach(() => { rpc.mockReset(); user = { id: 'u1' } })

describe('GET /api/os/channels', () => {
    it('방마다 마지막 말과 시각을 한 번에 붙인다', async () => {
        rpc.mockResolvedValue({ data: [{ owner_id: 'c1', content: '결론부터\n말할게요', created_at: '2026-10-06T03:00:00Z' }], error: null })
        const { channels } = await (await GET()).json()
        expect(rpc).toHaveBeenCalledTimes(1)
        expect(rpc).toHaveBeenCalledWith('last_messages_for_channels', { p_ids: ['c1', 'c2'] })
        expect(channels[0]).toMatchObject({ id: 'c1', name: '팀', memberMentorIds: ['m1', 'm2'], members: [], last_message_preview: '결론부터 말할게요', last_message_at: '2026-10-06T03:00:00Z' })
        expect(channels[1]).toMatchObject({ id: 'c2', last_message_preview: null, last_message_at: null })
    })
    it('함수가 없어도 방 목록은 그대로', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })
        const { channels } = await (await GET()).json()
        expect(channels).toHaveLength(2)
        expect(channels[0].last_message_preview).toBeNull()
    })
    it('손님은 지금처럼', async () => {
        user = null
        expect(await (await GET()).json()).toEqual({ channels: [], guest: true })
    })
})
