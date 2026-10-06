import { describe, it, expect } from 'vitest'
import { pickInactiveNotNudged } from '../index'

function fakeDb(users: { id: string }[], unread: string[]) {
    return {
        from: (t: string) => {
            let ids: string[] = []
            const q: Record<string, unknown> = {}
            for (const m of ['select', 'lt', 'order', 'limit', 'eq']) q[m] = () => q
            q.in = (_c: string, v: string[]) => { ids = v; return q }
            q.then = (res: (v: unknown) => unknown) => Promise.resolve(t === 'users'
                ? { data: users.map(u => ({ ...u, display_name: null })), error: null }
                : { data: unread.filter(u => ids.includes(u)).map(user_id => ({ user_id })), error: null }).then(res)
            return q
        },
    } as never
}

describe('먼저 말 걸 사람 고르기', () => {
    it('이미 받은 사람을 먼저 거르고 50명을 채운다(같은 50명만 계속 뽑히지 않는다)', async () => {
        const users = Array.from({ length: 120 }, (_, i) => ({ id: `u${i}` }))
        const unread = Array.from({ length: 50 }, (_, i) => `u${i}`)   // 앞 50명은 이미 받음
        const picked = await pickInactiveNotNudged(fakeDb(users, unread), { inactiveBefore: new Date(), limit: 50 })
        expect(picked).toHaveLength(50)
        expect(picked[0].id).toBe('u50')
        expect(picked.some(p => unread.includes(p.id))).toBe(false)
    })
})
