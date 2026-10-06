// 손님이 가져온 대화는 origin='guest_import' 로, admin 클라이언트로 저장한다(가짜 봇 답이 봇이 한 말로 둔갑하지 않게).
import { describe, it, expect, vi } from 'vitest'

const inserted: Record<string, unknown>[] = []
const userClientWrites: string[] = []

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
        from: (t: string) => { userClientWrites.push(t); throw new Error('회원 권한으로 쓰면 안 된다') },
    }),
}))
vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
        from: (t: string) => ({
            insert: (row: Record<string, unknown>) => {
                if (t === 'messages') inserted.push(row)
                return { select: () => ({ single: async () => ({ data: { id: 's1' }, error: null }) }), then: (r: (v: unknown) => void) => r({ error: null }) }
            },
            update: () => ({ eq: async () => ({ error: null }) }),
        }),
    }),
}))
vi.mock('@/domains/mentor', () => ({ getMentorById: async () => ({ name: '글담쌤' }) }))

import { POST } from '../route'

describe('POST /api/sessions/merge', () => {
    it('손님이 가져온 봇 답을 guest_import 로 표시하고 회원 열쇠로는 쓰지 않는다', async () => {
        const res = await POST(new Request('http://x', {
            method: 'POST',
            body: JSON.stringify({ mentorId: 'm1', messages: [{ role: 'user', content: '안녕' }, { role: 'assistant', content: '가짜 봇 답' }] }),
        }))
        expect(res.status).toBe(200)
        expect(inserted).toHaveLength(2)
        expect(inserted.every(r => r.origin === 'guest_import')).toBe(true)
        expect(userClientWrites).toEqual([])
    })
})
