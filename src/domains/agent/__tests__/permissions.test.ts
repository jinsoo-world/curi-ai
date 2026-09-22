import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
    createPermissionRequest, decidePermissionRequest, listPermissionRequests,
    PermissionTableMissing, DECISIONS,
} from '../permissions'

/** 가짜 Supabase — 어떤 조건(eq)이 걸렸는지 기록해 「남의 카드 못 만짐」을 시험한다 */
function makeDb(result: { data?: unknown; error?: { code?: string; message: string } | null }) {
    const eqs: [string, unknown][] = []
    const inserted: Record<string, unknown>[] = []
    const updated: Record<string, unknown>[] = []
    const chain: Record<string, unknown> = {}
    const self = () => chain
    Object.assign(chain, {
        from: self,
        select: self,
        order: self,
        limit: () => ({ ...result, then: undefined }),
        insert: (row: Record<string, unknown>) => { inserted.push(row); return chain },
        update: (row: Record<string, unknown>) => { updated.push(row); return chain },
        eq: (col: string, val: unknown) => { eqs.push([col, val]); return chain },
        single: async () => result,
        maybeSingle: async () => result,
    })
    // limit() 은 목록 조회의 마지막 고리라 결과를 그대로 돌려준다
    chain.limit = async () => result
    return { db: chain as unknown as SupabaseClient, eqs, inserted, updated }
}

const ROW = {
    id: 'c1', mentor_id: 'm1', session_id: null, action_type: 'send_message',
    summary: '민수님에게 보내기', payload: { text: '안녕' }, status: 'pending',
    decided_at: null, decided_payload: null, created_at: '2026-09-25T00:00:00Z',
}

describe('createPermissionRequest', () => {
    it('항상 pending 으로 만들고 user_id 를 박아 넣는다', async () => {
        const { db, inserted } = makeDb({ data: ROW, error: null })
        const card = await createPermissionRequest(db, 'u1', {
            mentorId: 'm1', actionType: 'send_message', summary: '민수님에게 보내기', payload: { text: '안녕' },
        })
        expect(inserted[0].user_id).toBe('u1')
        expect(inserted[0].status).toBe('pending')
        expect(card.status).toBe('pending')
        expect(card.actionType).toBe('send_message')
    })

    it('표가 없으면 PermissionTableMissing 으로 알린다(화면이 「준비 중」을 띄운다)', async () => {
        const { db } = makeDb({ data: null, error: { code: '42P01', message: 'relation does not exist' } })
        await expect(createPermissionRequest(db, 'u1', { actionType: 'other', summary: 'x' }))
            .rejects.toBeInstanceOf(PermissionTableMissing)
    })
})

describe('decidePermissionRequest — 남의 카드·두 번 누르기 막기', () => {
    it('내 카드이면서 아직 답 안 한 카드만 바꾼다', async () => {
        const { db, eqs, updated } = makeDb({ data: { ...ROW, status: 'allowed' }, error: null })
        const card = await decidePermissionRequest(db, 'u1', 'c1', 'allowed')
        expect(eqs).toContainEqual(['user_id', 'u1'])
        expect(eqs).toContainEqual(['status', 'pending'])
        expect(eqs).toContainEqual(['id', 'c1'])
        expect(updated[0].status).toBe('allowed')
        expect(card?.status).toBe('allowed')
    })

    it('이미 답한 카드면 아무 줄도 안 바뀌고 null 을 돌려준다', async () => {
        const { db } = makeDb({ data: null, error: null })
        expect(await decidePermissionRequest(db, 'u1', 'c1', 'denied')).toBeNull()
    })

    it('허용·거절·고쳐서 허용 말고 다른 값은 거절한다', async () => {
        const { db } = makeDb({ data: ROW, error: null })
        await expect(decidePermissionRequest(db, 'u1', 'c1', 'pending')).rejects.toThrow()
        await expect(decidePermissionRequest(db, 'u1', 'c1', 'expired')).rejects.toThrow()
    })

    it('고쳐서 허용인데 고친 내용이 없으면 거절한다', async () => {
        const { db } = makeDb({ data: ROW, error: null })
        await expect(decidePermissionRequest(db, 'u1', 'c1', 'edited_allowed')).rejects.toThrow()
        await expect(decidePermissionRequest(db, 'u1', 'c1', 'edited_allowed', {})).rejects.toThrow()
    })

    it('답 3가지가 목록에 그대로 있다', () => {
        expect([...DECISIONS]).toEqual(['allowed', 'denied', 'edited_allowed'])
    })
})

describe('listPermissionRequests', () => {
    it('내 카드만, 기본은 아직 답 안 한 것', async () => {
        const { db, eqs } = makeDb({ data: [ROW], error: null })
        const list = await listPermissionRequests(db, 'u1')
        expect(eqs).toContainEqual(['user_id', 'u1'])
        expect(eqs).toContainEqual(['status', 'pending'])
        expect(list).toHaveLength(1)
        expect(list[0].summary).toBe('민수님에게 보내기')
    })

    it('all 이면 상태로 거르지 않는다', async () => {
        const { db, eqs } = makeDb({ data: [], error: null })
        await listPermissionRequests(db, 'u1', 'all')
        expect(eqs.find(([c]) => c === 'status')).toBeUndefined()
    })
})
