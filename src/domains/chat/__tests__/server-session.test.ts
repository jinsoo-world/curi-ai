import { describe, it, expect, vi } from 'vitest'
import { createServerSession } from '../server-session'

function fakeDb(result: { data: unknown; error: unknown } | 'throw') {
    const insert = vi.fn()
    const db = {
        from: (t: string) => ({
            insert: (row: unknown) => {
                insert(t, row)
                return { select: () => ({ single: async () => { if (result === 'throw') throw new Error('boom'); return result } }) }
            },
        }),
    }
    return { db: db as never, insert }
}

describe('createServerSession', () => {
    it('내 이름으로 대화방을 만들고 번호를 돌려준다', async () => {
        const { db, insert } = fakeDb({ data: { id: 's-1' }, error: null })
        expect(await createServerSession(db, 'u1', 'm1', '안녕하세요  반갑습니다')).toBe('s-1')
        expect(insert).toHaveBeenCalledWith('chat_sessions', { user_id: 'u1', mentor_id: 'm1', title: '안녕하세요 반갑습니다' })
    })
    it('제목은 30자까지, 비면 새 대화', async () => {
        const a = fakeDb({ data: { id: 's' }, error: null })
        await createServerSession(a.db, 'u', 'm', 'ㄱ'.repeat(80))
        expect((a.insert.mock.calls[0][1] as { title: string }).title).toHaveLength(30)
        const b = fakeDb({ data: { id: 's' }, error: null })
        await createServerSession(b.db, 'u', 'm', '   ')
        expect((b.insert.mock.calls[0][1] as { title: string }).title).toBe('새 대화')
    })
    it('만들지 못하면 null (한도를 못 세므로 부른 쪽이 막는다)', async () => {
        expect(await createServerSession(fakeDb({ data: null, error: { message: 'x' } }).db, 'u', 'm', 'hi')).toBeNull()
        expect(await createServerSession(fakeDb('throw').db, 'u', 'm', 'hi')).toBeNull()
    })
})
