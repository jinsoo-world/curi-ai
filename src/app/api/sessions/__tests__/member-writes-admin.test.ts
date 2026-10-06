// 회원 열쇠로 messages·chat_sessions·notifications·users 에 쓰지 않는다 (20261021 잠금 대비)
// 회원 열쇠(세션 클라이언트)는 표에 직접 손대면 실패하게 만들고, 쓰기가 관리자 열쇠 + 주인 조건으로 가는지 본다.
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Call = { table: string; op: string; payload?: unknown; filters: [string, string, unknown][] }
const adminCalls: Call[] = []
const USER = '11111111-1111-4111-8111-111111111111'

function adminDb() {
    return {
        from(table: string) {
            const call: Call = { table, op: 'select', filters: [] }
            adminCalls.push(call)
            const q: Record<string, unknown> = {}
            const res = { data: { id: 's1', title: 't' }, error: null }
            Object.assign(q, {
                select: () => q,
                insert: (p: unknown) => { call.op = 'insert'; call.payload = p; return q },
                update: (p: unknown) => { call.op = 'update'; call.payload = p; return q },
                delete: () => { call.op = 'delete'; return q },
                eq: (k: string, v: unknown) => { call.filters.push(['eq', k, v]); return q },
                is: (k: string, v: unknown) => { call.filters.push(['is', k, v]); return q },
                order: () => q, limit: () => q,
                single: async () => res,
                maybeSingle: async () => res,
                then: (r: (v: unknown) => void) => r({ data: [{ id: 's1' }], error: null }),
            })
            return q
        },
    }
}

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
        from: (t: string) => { throw new Error(`회원 열쇠로 ${t} 표를 직접 건드렸다`) },
    }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminDb() }))
vi.mock('@/domains/mentor', () => ({ getMentorById: async () => ({ name: '봇' }) }))

import { PATCH as sessionPATCH } from '@/app/api/sessions/[sessionId]/route'
import { POST as deleteByMentor } from '@/app/api/sessions/delete-by-mentor/route'
import { POST as sessionPOST } from '@/app/api/sessions/route'
import { GET as notiGET, PATCH as notiPATCH } from '@/app/api/notifications/route'

const json = (body: unknown) => new Request('http://x', { method: 'POST', body: JSON.stringify(body) })
const hasOwner = (c: Call) => c.filters.some(([, k, v]) => k === 'user_id' && v === USER)

beforeEach(() => { adminCalls.length = 0 })

describe('회원 쓰기는 관리자 열쇠 + 주인 조건으로', () => {
    it('대화방 이름 바꾸기', async () => {
        const res = await sessionPATCH(json({ title: '새 이름' }), { params: Promise.resolve({ sessionId: 's1' }) })
        expect(res.status).toBe(200)
        const up = adminCalls.find(c => c.table === 'chat_sessions' && c.op === 'update')!
        expect(up.payload).toEqual({ title: '새 이름' })
        expect(hasOwner(up)).toBe(true)
    })

    it('봇과의 대화 전부 지우기', async () => {
        const res = await deleteByMentor(json({ mentorId: 'm1' }))
        expect(res.status).toBe(200)
        const up = adminCalls.find(c => c.table === 'chat_sessions' && c.op === 'update')!
        expect(hasOwner(up)).toBe(true)
    })

    it('새 대화방 만들기는 로그인한 본인 id 로', async () => {
        const res = await sessionPOST(json({ mentorId: 'm1' }))
        expect(res.status).toBe(200)
        const ins = adminCalls.find(c => c.table === 'chat_sessions' && c.op === 'insert')!
        expect((ins.payload as { user_id: string }).user_id).toBe(USER)
    })

    it('알림 읽기·읽음 처리는 내 알림만', async () => {
        await notiGET()
        expect(hasOwner(adminCalls.find(c => c.table === 'notifications')!)).toBe(true)
        adminCalls.length = 0
        const res = await notiPATCH(json({ notificationId: 'n1' }))
        expect(res.status).toBe(200)
        const up = adminCalls.find(c => c.table === 'notifications' && c.op === 'update')!
        expect(up.filters).toEqual(expect.arrayContaining([['eq', 'id', 'n1'], ['eq', 'user_id', USER]]))
    })
})
