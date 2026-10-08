// /api/os/deep-create — 요금제별 분기, 하루 한도, 예산 스위치, 미리보기 잘림, 저장 권한, 작업 상태
import { describe, it, expect, vi, beforeEach } from 'vitest'

let user: { id: string; email?: string; user_metadata?: Record<string, string> } | null = { id: 'u1' }
let plan: string | null = null
let usedToday: number | null = 0
let running: { id: string; status: string } | null = null
let insertErr: { code?: string; message: string } | null = null
let budget = { allowed: true } as { allowed: boolean; reason?: string }
let jobRow: Record<string, unknown> | null = null
let saveClaim = true
let dayBump: number | null = 1
const rpcCalls: unknown[][] = []
const inserted: Record<string, unknown>[] = []
const mentorUpdates: Record<string, unknown>[] = []
const runs: string[] = []
const created: unknown[] = []
const textSources: unknown[][] = []
const limits: Record<string, boolean> = {}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }))
vi.mock('@/lib/supabase/admin', () => ({
    createAdminClient: () => ({
        rpc: async (...a: unknown[]) => (rpcCalls.push(a), dayBump === null ? { data: null, error: { message: 'x' } } : { data: dayBump, error: null }),
        from: (t: string) => {
            if (t === 'user_plans') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: plan ? { plan, expires_at: null } : null, error: null }) }) }) }
            if (t === 'mentors') return { update: (p: Record<string, unknown>) => ({ eq: async () => (mentorUpdates.push(p), { error: null }) }) }
            const q: Record<string, unknown> = {}
            let mode = ''
            q.insert = (row: Record<string, unknown>) => { inserted.push(row); mode = 'insert'; return q }
            q.update = (p: Record<string, unknown>) => { mode = p.saved_at ? 'claim' : 'update'; return q }
            for (const k of ['eq', 'neq', 'gte', 'in', 'order', 'is', 'or']) q[k] = () => q
            q.select = (_c?: string, opts?: { head?: boolean }) => { if (opts?.head) mode = 'count'; return q }
            q.limit = async () => ({ data: running ? [running] : [], error: null })
            q.single = async () => (insertErr ? { data: null, error: insertErr } : { data: { id: 'job-1', status: 'research' }, error: null })
            q.maybeSingle = async () => ({ data: jobRow, error: null })
            q.then = (res: (v: unknown) => unknown) => {
                if (mode === 'count') return Promise.resolve(usedToday === null ? { count: null, error: { message: 'x' } } : { count: usedToday, error: null }).then(res)
                if (mode === 'claim') return Promise.resolve({ data: saveClaim ? [{ id: 'j' }] : [], error: null }).then(res)
                return Promise.resolve({ data: null, error: null }).then(res)
            }
            return q
        },
    }),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async (_d: unknown, key: string, limit: number) => ({ allowed: limits[`${key}:${limit}`] !== false }) }))
vi.mock('@/domains/chat/budget-gate', () => ({ checkAiBudget: async (_d: unknown, who: { paid: boolean }) => (who.paid ? { allowed: true } : budget) }))
vi.mock('@/domains/llm/usage-log', () => ({ keepAliveAfterResponse: () => {} }))
vi.mock('@/domains/os/team', () => ({ createTeamBot: async (...a: unknown[]) => (created.push(a), { id: 'tb1', mentorId: 'm1', name: 'x' }) }))
vi.mock('@/domains/os/knowledge', () => ({ addTextSource: async (...a: unknown[]) => { textSources.push(a) } }))
vi.mock('@/domains/os/deep-create', async (orig) => {
    const real = await orig<typeof import('@/domains/os/deep-create')>()
    return {
        ...real,
        runDeepJob: async (_db: unknown, id: string) => { runs.push(id) },
        countDeepToday: async () => usedToday === -1 ? (() => { throw new real.DeepTableMissing() })() : real.countDeepToday(_dbFor(), 'u1'),
        findRunningDeepJob: async () => running,
    }
})
// countDeepToday 진짜 함수를 가짜 DB 로 돌린다
import { createAdminClient } from '@/lib/supabase/admin'
function _dbFor() { return createAdminClient() as never }

import { POST as START } from '@/app/api/os/deep-create/route'
import { GET } from '@/app/api/os/deep-create/[id]/route'
import { POST as SAVE } from '@/app/api/os/deep-create/[id]/save/route'

const JOB_ID = '11111111-2222-3333-4444-555555555555'
const start = (body: unknown) => START(new Request('https://x/api/os/deep-create', { method: 'POST', body: JSON.stringify(body) }))
const get = (id = JOB_ID) => GET(new Request('https://x'), { params: Promise.resolve({ id }) })
const save = (id = JOB_ID) => SAVE(new Request('https://x', { method: 'POST' }), { params: Promise.resolve({ id }) })

const result = {
    kind: 'person', subjectName: '잡스', isRealPerson: true, name: '잡스 봇', oneLiner: '덜어내는 기획', greeting: '안녕', sampleQuestions: ['a', 'b', 'c'],
    promptText: '> 이 봇은 잡스 본인이 아니라\n' + '가'.repeat(3_000), checks: { stance: [], outOfScope: '', style: '' },
}
const doneJob = (over: Record<string, unknown> = {}) => ({
    id: JOB_ID, user_id: 'u1', plan: 'free', status: 'done', idea: '잡스 같은 기획 봇', ref_links: [], ref_text: null,
    research: { notes: '조사 노트 '.repeat(20), sources: [{ url: 'https://s', title: 'S' }], material: '' }, result,
    fidelity: { total: 78, grade: 'B', items: [], weaknesses: ['출처 적음'] }, error: null, claimed_at: null, attempts: 0, saved_at: null, mentor_id: null, created_at: new Date().toISOString(), ...over,
})

beforeEach(() => {
    user = { id: 'u1' }; plan = null; usedToday = 0; running = null; insertErr = null; budget = { allowed: true }; jobRow = null; saveClaim = true; dayBump = 1; rpcCalls.length = 0
    for (const a of [inserted, mentorUpdates, runs, created, textSources]) a.length = 0
    for (const k of Object.keys(limits)) delete limits[k]
})

describe('POST /api/os/deep-create (시작)', () => {
    it('손님 401, 빈 글 400', async () => {
        user = null
        expect((await start({ idea: '세무 봇' })).status).toBe(401)
        user = { id: 'u1' }
        expect((await start({})).status).toBe(400)
        expect(inserted).toHaveLength(0)
    })

    it('무료: 작업은 시작하되 paywall true (미리보기용), 단계 실행을 건다', async () => {
        const res = await start({ idea: '잡스 같은 기획 봇', links: ['https://a'] })
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ jobId: 'job-1', status: 'research', stage: '조사 중', paywall: true })
        expect(inserted[0]).toMatchObject({ user_id: 'u1', plan: 'free', status: 'research', ref_links: ['https://a'] })
        expect(runs).toEqual(['job-1'])
    })

    it('하루 한도: 무료 1 · 베이직 3 · 프로 10', async () => {
        usedToday = 1; dayBump = 2
        const free = await start({ idea: '세무 봇' })
        expect(free.status).toBe(429)
        expect(await free.json()).toMatchObject({ paywall: true })
        plan = 'basic'; usedToday = 2; dayBump = 3
        expect((await start({ idea: '세무 봇' })).status).toBe(200)
        usedToday = 3
        expect((await start({ idea: '세무 봇' })).status).toBe(429)
        plan = 'pro'; usedToday = 9; dayBump = 10
        const ok = await start({ idea: '세무 봇' })
        expect(ok.status).toBe(200)
        expect(await ok.json()).toMatchObject({ paywall: false })
        usedToday = 10
        expect((await start({ idea: '세무 봇' })).status).toBe(429)
    })

    it('원자적 하루 카운터: 올린 값이 한도를 넘으면 넣지 않는다 (동시에 두 번 눌러도)', async () => {
        plan = 'basic'; usedToday = 2; dayBump = 4
        const res = await start({ idea: '세무 봇' })
        expect(res.status).toBe(429)
        expect(inserted).toHaveLength(0)
        expect(rpcCalls[0][0]).toBe('bump_rate_limit')
        expect(String((rpcCalls[0][1] as { p_key: string }).p_key)).toMatch(/^deep:day:u1:\d{4}-\d{2}-\d{2}$/)
        dayBump = 3
        expect((await start({ idea: '세무 봇' })).status).toBe(200)
    })

    it('하루 카운터를 셀 수 없으면 막는다(503)', async () => {
        dayBump = null
        expect((await start({ idea: '세무 봇' })).status).toBe(503)
        expect(inserted).toHaveLength(0)
    })

    it('셀 수 없으면 503, 표가 없으면 503(곧 열려요)', async () => {
        usedToday = null
        expect((await start({ idea: '세무 봇' })).status).toBe(503)
        usedToday = -1
        expect((await start({ idea: '세무 봇' })).status).toBe(503)
        expect(inserted).toHaveLength(0)
    })

    it('예산 90% 넘으면 무료 미리보기만 멈춘다', async () => {
        budget = { allowed: false, reason: 'budget_free' }
        expect((await start({ idea: '세무 봇' })).status).toBe(429)
        plan = 'basic'
        expect((await start({ idea: '세무 봇' })).status).toBe(200)
    })

    it('시간당 5번 넘으면 429', async () => {
        limits['deep-create:h:u1:5'] = false
        expect((await start({ idea: '세무 봇' })).status).toBe(429)
    })

    it('이미 도는 내 작업이 있으면 새로 안 만들고 그걸 돌려준다', async () => {
        running = { id: 'job-0', status: 'write' }
        const res = await start({ idea: '세무 봇' })
        expect(await res.json()).toMatchObject({ jobId: 'job-0', status: 'write', stage: '정리 중', resumed: true })
        expect(inserted).toHaveLength(0)
    })
})

describe('GET /api/os/deep-create/{id} (상태)', () => {
    it('없거나 남의 작업이면 404, 이상한 id 404', async () => {
        expect((await get()).status).toBe(404)
        expect((await get('x')).status).toBe(404)
    })

    it('무료: 앞 600자 + 점수만, paywall true', async () => {
        jobRow = doneJob()
        const j = await (await get()).json()
        expect(j).toMatchObject({ status: 'done', paywall: true, fidelity: { total: 78, grade: 'B' } })
        expect([...j.result.promptPreview].length).toBe(600)
        expect(j.result.promptText).toBeUndefined()
        expect(j.fidelity.weaknesses).toBeUndefined()
    })

    it('구독하고 다시 보면 전문이 열린다', async () => {
        jobRow = doneJob(); plan = 'basic'
        const j = await (await get()).json()
        expect(j.paywall).toBe(false)
        expect(j.result.promptText).toBe(result.promptText)
        expect(j.fidelity.weaknesses).toEqual(['출처 적음'])
    })

    it('끊겨 멈춘 작업은 이어서 돌린다', async () => {
        jobRow = doneJob({ status: 'write', result: null, claimed_at: null })
        const j = await (await get()).json()
        expect(j).toMatchObject({ status: 'write', stage: '정리 중', result: null })
        expect(runs).toEqual([JOB_ID])
    })
})

describe('POST /api/os/deep-create/{id}/save (저장)', () => {
    it('무료는 402 paywall, 봇을 만들지 않는다', async () => {
        jobRow = doneJob()
        const res = await save()
        expect(res.status).toBe(402)
        expect(await res.json()).toMatchObject({ paywall: true })
        expect(created).toHaveLength(0)
    })

    it('아직 만드는 중이면 409', async () => {
        plan = 'basic'; jobRow = doneJob({ status: 'check' })
        expect((await save()).status).toBe(409)
    })

    it('구독자: 비공개 봇을 만들고 지시문 전문·인사·추천 질문을 넣고 조사 자료를 봇 자료로', async () => {
        plan = 'pro'; jobRow = doneJob()
        const res = await save()
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ mentorId: 'm1', referencesSaved: true, bot: { id: 'tb1', systemPrompt: result.promptText } })
        expect(created[0]).toMatchObject([expect.anything(), { id: 'u1' }, { job: 'custom', name: '잡스 봇' }, 'deep_create'])
        expect(mentorUpdates[0]).toMatchObject({ system_prompt: result.promptText, greeting_message: '안녕', sample_questions: ['a', 'b', 'c'] })
        expect(String(textSources[0][3])).toContain('https://s')
    })

    it('이미 저장했으면 같은 봇을 돌려주고, 동시에 두 번 누르면 하나만', async () => {
        plan = 'basic'; jobRow = doneJob({ saved_at: 'x', mentor_id: 'm9' })
        expect(await (await save()).json()).toEqual({ mentorId: 'm9', alreadySaved: true })
        jobRow = doneJob(); saveClaim = false
        expect((await save()).status).toBe(409)
        expect(created).toHaveLength(0)
    })
})
