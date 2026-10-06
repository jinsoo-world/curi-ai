// 봇 비밀 칸(지시문·말투 틀·성격 꼬리표) 칸 권한 잠금 대비
// DB 에서 anon·authenticated 의 비밀 칸 읽기 권한을 거두면(20261021_mentors_column_lockdown.sql)
// 로그인 세션/손님 열쇠로 select('*') 나 비밀 칸을 읽는 곳은 42501 로 깨진다.
// ① 세션 클라이언트로는 공개 칸만 읽는다 ② 비밀 칸은 관리자 열쇠로만 따로 읽는다 ③ 마이그레이션 칸 목록 = 공개 칸 목록
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Call = { table: string; select: string; filters: [string, unknown][] }

function fakeDb(rows: Record<string, unknown>[], calls: Call[]) {
    return {
        from(table: string) {
            const call: Call = { table, select: '', filters: [] }
            calls.push(call)
            const pick = () => rows.find(r => call.filters.every(([k, v]) => r[k] === v)) ?? null
            const q: Record<string, unknown> = {}
            Object.assign(q, {
                select: (s: string) => { call.select = s; return q },
                eq: (k: string, v: unknown) => { call.filters.push([k, v]); return q },
                single: async () => { const r = pick(); return r ? { data: r, error: null } : { data: null, error: { code: 'PGRST116' } } },
                maybeSingle: async () => ({ data: pick(), error: null }),
            })
            return q
        },
    }
}

const BOT = '9fc9b3fa-1721-40c6-bc4e-1b544c117483'
const FULL = {
    id: BOT, slug: 'test-bot', name: '테스트봇', is_active: true, status: 'active', creator_id: 'c1',
    system_prompt: '비밀 지시문', persona_template: '틀', style_template: { tone: 'x' }, personality_traits: ['따뜻한'],
}

const adminCalls: Call[] = []
let adminAvailable = true
vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => {
        if (!adminAvailable) throw new Error('no service key')
        return fakeDb([FULL], adminCalls)
    },
}))

import { getMentorById, getPublicMentorById } from '../queries'
import { PUBLIC_MENTOR_FIELDS, PRIVATE_MENTOR_FIELDS } from '../public-fields'

const SECRET = /system_prompt|persona_template|style_template|personality_traits|\*/

beforeEach(() => { adminCalls.length = 0; adminAvailable = true })

describe('getMentorById — 세션 클라이언트로는 공개 칸만', () => {
    it('세션 조회에 * 와 비밀 칸이 없다. 비밀 칸은 관리자 열쇠로 따로 붙는다', async () => {
        const sessionCalls: Call[] = []
        const sessionRow = Object.fromEntries(Object.entries(FULL).filter(([k]) => !(PRIVATE_MENTOR_FIELDS as readonly string[]).includes(k)))
        const m = await getMentorById(fakeDb([sessionRow], sessionCalls) as never, BOT)
        expect(sessionCalls.length).toBeGreaterThan(0)
        for (const c of sessionCalls) expect(c.select).not.toMatch(SECRET)
        expect(adminCalls.map(c => c.select)).toEqual([PRIVATE_MENTOR_FIELDS.join(', ')])
        expect(adminCalls[0].filters).toEqual([['id', BOT]])
        expect((m as Record<string, unknown>).system_prompt).toBe('비밀 지시문')
        expect((m as Record<string, unknown>).name).toBe('테스트봇')
    })

    it('세션으로 안 보이는 봇(남의 비공개 봇)은 관리자 열쇠로 비밀 칸을 읽지 않는다', async () => {
        const sessionCalls: Call[] = []
        const m = await getMentorById(fakeDb([], sessionCalls) as never, BOT)
        expect(adminCalls).toHaveLength(0)
        expect(m === null || !('system_prompt' in (m as object)) || (m as Record<string, unknown>).id !== BOT).toBe(true)
    })

    it('slug 로 찾아도 같은 규칙', async () => {
        const sessionCalls: Call[] = []
        const sessionRow = { id: BOT, slug: 'test-bot', name: '테스트봇' }
        const m = await getMentorById(fakeDb([sessionRow], sessionCalls) as never, 'test-bot')
        for (const c of sessionCalls) expect(c.select).not.toMatch(SECRET)
        expect(adminCalls[0]?.filters).toEqual([['id', BOT]])
        expect((m as Record<string, unknown>).system_prompt).toBe('비밀 지시문')
    })

    it('관리자 열쇠가 없어도 공개 칸으로는 돌아간다', async () => {
        adminAvailable = false
        const m = await getMentorById(fakeDb([{ id: BOT, name: '테스트봇' }], []) as never, BOT)
        expect((m as Record<string, unknown>).name).toBe('테스트봇')
    })
})

describe('getPublicMentorById — 기본은 공개 칸만', () => {
    it('화면용(기본)은 비밀 칸을 읽지 않는다', async () => {
        const m = await getPublicMentorById(BOT)
        for (const c of adminCalls) expect(c.select).not.toMatch(SECRET)
        expect(m).not.toBeNull()
    })
    it('대화용(withPrivate)만 비밀 칸까지 읽는다', async () => {
        const m = await getPublicMentorById(BOT, { withPrivate: true })
        expect((m as Record<string, unknown>).system_prompt).toBe('비밀 지시문')
    })
})

describe('마이그레이션 칸 목록', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261021_mentors_column_lockdown.sql'), 'utf8')
    const code = sql.replace(/--.*$/gm, '')

    it('anon·authenticated 에게 주는 읽기 칸 = 공개 칸 목록과 정확히 같다', () => {
        const m = /grant\s+select\s*\(([^)]*)\)\s*on\s+(?:table\s+)?public\.mentors\s+to\s+anon\s*,\s*authenticated/i.exec(code)
        expect(m).not.toBeNull()
        const cols = m![1].split(',').map(s => s.trim()).filter(Boolean)
        expect([...cols].sort()).toEqual([...PUBLIC_MENTOR_FIELDS].sort())
    })
    it('회원·손님에게 mentors 쓰기 권한을 다시 주지 않는다', () => {
        expect(code).not.toMatch(/grant\s+(?:insert|update|delete|all)[^;]*on\s+(?:table\s+)?public\.mentors\s+to\s+[^;]*(anon|authenticated)/i)
    })
    it('messages·chat_sessions 는 회원에게 읽기만', () => {
        expect(code).toMatch(/revoke\s+all\s+on\s+table\s+public\.messages\s+from\s+anon\s*,\s*authenticated/i)
        expect(code).toMatch(/revoke\s+all\s+on\s+table\s+public\.chat_sessions\s+from\s+anon\s*,\s*authenticated/i)
        expect(code).not.toMatch(/grant\s+(?:insert|update|delete|all)[^;]*public\.(messages|chat_sessions)\s+to\s+[^;]*(anon|authenticated)/i)
    })
    it('비밀 칸은 읽기 권한 목록에 없다', () => {
        for (const k of PRIVATE_MENTOR_FIELDS) expect(PUBLIC_MENTOR_FIELDS as readonly string[]).not.toContain(k)
        expect(code).toMatch(/revoke\s+(?:all|select)\s+on\s+(?:table\s+)?public\.mentors\s+from\s+anon\s*,\s*authenticated/i)
    })
})
