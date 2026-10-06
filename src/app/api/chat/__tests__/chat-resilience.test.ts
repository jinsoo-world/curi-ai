// POST /api/chat — 2026-10-06 「통째로 멈춤」 점검 후속.
// 사용자 말 먼저 저장 · 끝 신호를 저장보다 먼저 · 실패 답은 저장·차감 안 함 · 대화 마감 · 지난 대화 줄이기 · 손님 문지기
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hashIp } from '@/domains/chat/guest-gate'

const UNAVAILABLE = '지금은 잠깐 쉬는 중이에요'
type Op = { table: string; op: string; row?: Record<string, unknown>; filters?: Record<string, unknown> }
const state: {
    user: { id: string; email?: string } | null
    ops: Op[]
    guestCountError: boolean
    guestCount: number
    answer: string[]
    holdAssistantInsert: Promise<void> | null
    llmCalls: { system: string; history: unknown[]; opts: Record<string, unknown>; opsBefore: number }[]
    afterWork: Promise<unknown>[]
    usage: Record<string, unknown> | null
    monthCost: number
    rpcCalls: string[]
} = { usage: { plan: 'free', blocked: false, resetAt: new Date() }, monthCost: 0, rpcCalls: [], user: null, ops: [], guestCountError: false, guestCount: 0, answer: ['안녕', '하세요'], holdAssistantInsert: null, llmCalls: [], afterWork: [] }

function fakeDb() {
    return {
        from(table: string) {
            const filters: Record<string, unknown> = {}
            let op = 'select'
            let row: Record<string, unknown> | undefined
            const result = () => {
                if (op === 'select' && table === 'guest_chat_logs') {
                    return state.guestCountError ? { count: null, error: { message: 'timeout' } } : { count: state.guestCount, error: null }
                }
                if (op === 'select' && table === 'chat_sessions') return { data: state.user ? { user_id: state.user.id } : null, error: null }
                if (op === 'insert' && table === 'chat_sessions') return { data: { id: 'new-session' }, error: null }
                return { data: null, count: 0, error: null }
            }
            const q: Record<string, unknown> = {
                select() { return q }, gte() { return q }, lt() { return q }, order() { return q }, limit() { return q },
                eq(c: string, v: unknown) { filters[c] = v; return q },
                insert(r: Record<string, unknown>) {
                    op = 'insert'; row = r
                    state.ops.push({ table, op, row: r })
                    return q
                },
                update(r: Record<string, unknown>) { op = 'update'; row = r; state.ops.push({ table, op, row: r }); return q },
                delete() { op = 'delete'; state.ops.push({ table, op, filters }); return q },
                maybeSingle: async () => result(),
                single: async () => result(),
                then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
                    if (op === 'insert' && table === 'messages' && row?.role === 'assistant' && state.holdAssistantInsert) {
                        return state.holdAssistantInsert.then(() => ({ data: null, error: null })).then(res, rej)
                    }
                    return Promise.resolve(result()).then(res, rej)
                },
            }
            void row
            return q
        },
        rpc: async (name: string) => {
            state.rpcCalls.push(name)
            if (name === 'llm_cost_krw_month') return { data: state.monthCost, error: null }
            return { data: 1, error: null }
        },
        auth: { getUser: async () => ({ data: { user: state.user } }) },
    }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeDb() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeDb() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true, remaining: 1 }), rateLimitKey: () => 'k', rateLimitMessage: () => 'm' }))
vi.mock('@/domains/llm/usage-log', () => ({ logLlmUsage: () => {}, keepAliveAfterResponse: (p: Promise<unknown>) => { state.afterWork.push(p) } }))
vi.mock('@/domains/mentor', () => ({
    getMentorById: async () => ({ id: '11111111-1111-4111-8111-111111111111', name: '봇', greeting_message: '안녕', creator_id: null }),
    getPublicMentorById: async () => null,
    buildSystemPrompt: () => 'SYS',
    buildGeminiHistory: (_g: string, msgs: unknown[]) => msgs,
}))
vi.mock('@/domains/user', () => ({ getUserChatContext: async () => null }))
vi.mock('@/domains/chat', () => ({
    generateChatStream: async (system: string, history: unknown[], opts: Record<string, unknown>) => {
        state.llmCalls.push({ system, history, opts, opsBefore: state.ops.length })
        const parts = state.answer
        return (async function* () { for (const t of parts) yield { text: t } })()
    },
    getUserMemories: async () => [],
    incrementDailyFreeUsage: async () => {},
    detectCrisisKeywords: () => false,
    CRISIS_RESPONSE: '위기', ERROR_MESSAGES: { streamError: 'stream', serverError: 'server' },
    extractAndSaveMemories: async () => {}, extractAndUpdateTopic: async () => {},
    saveUserMessage: async () => {}, saveAssistantMessage: async () => {}, updateSessionActivity: async () => {},
}))
vi.mock('@/domains/chat/constants', async (orig) => ({ ...(await orig<object>()), UNAVAILABLE_TEXT: '지금은 잠깐 쉬는 중이에요' }))
vi.mock('@/domains/os', () => ({ getOwnedTeamBotMentor: async () => null }))
vi.mock('@/domains/os/usage-db', () => ({ readUsage: async () => { if (!state.usage) throw new Error('db down'); return state.usage } }))
vi.mock('@/domains/os/audience-db', () => ({ checkChatAudience: async () => ({ allowed: true }), checkVisitorBotWeeklyLimit: async () => ({ allowed: true }) }))
vi.mock('@/domains/os/knowledge', () => ({ findSourcesOfChunks: async () => [] }))
vi.mock('@/domains/os/readers', () => ({ readUrlsInText: async () => [], buildLinkPrompt: () => ({ readUrls: [], anyOk: false, prefix: '', sources: [] }), linkTextForTurn: () => ({ text: '', fromHistory: false }) }))
vi.mock('@/domains/connectors', () => ({ findProvider: () => null, providerReady: () => false, findConnector: async () => null }))
vi.mock('@/domains/mcp/chat', () => ({ runMcpForChat: async () => ({ hadServers: false, material: '', sources: [] }) }))
vi.mock('@/domains/os/skills', () => ({ skillsForMentor: async () => [], applySkills: (s: string) => s }))
vi.mock('@/domains/os/response-settings', () => ({
    loadResponseSettingsForChat: async () => ({ settings: {}, kind: 'personal', maxOutputTokens: 500, recencyOn: false, citationsOn: false, noAnswerText: '모름', initialMessage: '' }),
    applyResponseSettingsToPrompt: (s: string) => s, weakKnowledgePrompt: () => '', STRICT_MIN_SIMILARITY: 0.7,
}))
vi.mock('@/domains/chat/semantic-cache', () => ({
    semanticCacheEnabled: () => false, cacheEligibility: () => ({ ok: false }), cacheScopeKey: () => null, botVersion: () => '', knowledgeVersion: async () => null,
    lookupCachedAnswer: async () => null, storeCachedAnswer: async () => {}, isStorableAnswer: () => false, cachedAnswerStream: () => null, cacheAllowsGemini: () => false,
}))
vi.mock('@/domains/knowledge', () => ({ generateEmbedding: async () => [], matchKnowledge: async () => [] }))
vi.mock('@/domains/knowledge/corrective', () => ({ correctiveRetrieve: async () => ({ tried: false, used: false }) }))
vi.mock('@/domains/agent/ask', () => ({ askQuickWithFallback: async () => null }))
vi.mock('@/domains/os/blocks', () => ({ isBotBlocked: async () => false }))
vi.mock('@/domains/chat/signals', () => ({ recordTopicGap: async () => {} }))
vi.mock('@/domains/os/onboarding', () => ({ onboardingForChat: () => ({ occupation: null, orgName: null, useCases: [] }) }))
vi.mock('@/domains/llm', () => ({ pickDriverFromEnv: () => 'solar' }))
vi.mock('@/domains/tts/grant', () => ({ signGrant: () => null }))

import { POST } from '../route'
import { resetBudgetCacheForTest } from '@/domains/chat/budget-gate'

function req(body: Record<string, unknown>, ip = '7.7.7.7') {
    return new Request('http://x/api/chat', { method: 'POST', headers: { 'x-forwarded-for': ip }, body: JSON.stringify(body) })
}
/** SSE 를 끝(done)까지 읽어 이벤트 목록으로 */
async function readUntilDone(res: Response): Promise<Record<string, unknown>[]> {
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    let buf = ''
    const events: Record<string, unknown>[] = []
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const parts = buf.split('\n\n')
        buf = parts.pop() ?? ''
        for (const p of parts) if (p.startsWith('data: ')) events.push(JSON.parse(p.slice(6)))
        if (events.some(e => e.done)) { reader.cancel().catch(() => {}); break }
    }
    return events
}
const flushAfter = async () => { for (let i = 0; i < 5; i++) await Promise.all(state.afterWork.splice(0)) }

const ME = { id: '99999999-9999-4999-8999-999999999999', email: 'a@b.c' }
const SESSION = '88888888-8888-4888-8888-888888888888'

beforeEach(() => {
    state.user = null
    state.ops = []
    state.guestCountError = false
    state.guestCount = 0
    state.answer = ['안녕', '하세요']
    state.holdAssistantInsert = null
    state.llmCalls = []
    state.afterWork = []
    state.usage = { plan: 'free', blocked: false, resetAt: new Date() }
    state.monthCost = 0
    state.rpcCalls = []
    resetBudgetCacheForTest()
    vi.stubEnv('GUEST_CHAT_DISABLED', '')
    vi.stubEnv('AI_BUDGET_MONTHLY_KRW', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
})

describe('손님 문지기·비용 스위치', () => {
    it('GUEST_CHAT_DISABLED=1 이면 모델을 부르지 않고 로그인 유도', async () => {
        vi.stubEnv('GUEST_CHAT_DISABLED', '1')
        const ev = await readUntilDone(await POST(req({ messages: [{ role: 'user', content: '안녕' }], mentorId: 'm' })))
        expect(ev[0]).toMatchObject({ done: true, guestLimit: true, budgetPaused: true })
        expect(state.llmCalls).toHaveLength(0)
    })

    it('손님 횟수를 세다 실패하면 막는다', async () => {
        state.guestCountError = true
        const ev = await readUntilDone(await POST(req({ messages: [{ role: 'user', content: '안녕' }], mentorId: 'm', visitorId: 'visitor_abc123' })))
        expect(ev[0]).toMatchObject({ done: true, guestLimit: true })
        expect(state.llmCalls).toHaveLength(0)
    })

    it('번호 없는 손님 대화는 ip-해시 이름표로 저장된다(세는 이름표와 같다)', async () => {
        const ev = await readUntilDone(await POST(req({ messages: [{ role: 'user', content: '안녕' }], mentorId: 'm' })))
        expect(ev.at(-1)).toMatchObject({ done: true, fullResponse: '안녕하세요' })
        await flushAfter()
        const log = state.ops.find(o => o.table === 'guest_chat_logs' && o.op === 'insert')
        expect(log?.row?.visitor_id).toBe(`ip-${hashIp('7.7.7.7')}`)
    })

    it('손님의 실패 답(쉬는 중)은 기록하지 않는다(횟수에서 안 빠진다)', async () => {
        state.answer = [UNAVAILABLE]
        await readUntilDone(await POST(req({ messages: [{ role: 'user', content: '안녕' }], mentorId: 'm' })))
        await flushAfter()
        expect(state.ops.find(o => o.table === 'guest_chat_logs')).toBeUndefined()
    })
})

describe('회원 대화 — 저장 순서와 끊김 대비', () => {
    beforeEach(() => { state.user = ME })

    it('사용자 말은 모델을 부르기 전에 저장한다', async () => {
        await readUntilDone(await POST(req({ messages: [{ role: 'user', content: '질문' }], mentorId: 'm', sessionId: SESSION })))
        const call = state.llmCalls[0]
        const userInsertIdx = state.ops.findIndex(o => o.table === 'messages' && o.op === 'insert' && o.row?.role === 'user')
        expect(userInsertIdx).toBeGreaterThanOrEqual(0)
        expect(userInsertIdx).toBeLessThan(call.opsBefore)
    })

    it('끝 신호(done)는 답 저장을 기다리지 않고 먼저 간다. 저장된 답 번호도 같이', async () => {
        let release!: () => void
        state.holdAssistantInsert = new Promise<void>(r => { release = r })
        const ev = await readUntilDone(await POST(req({ messages: [{ role: 'user', content: '질문' }], mentorId: 'm', sessionId: SESSION })))
        const done = ev.find(e => e.done)!
        expect(done.fullResponse).toBe('안녕하세요')
        expect(typeof done.messageId).toBe('string')
        release()
        await flushAfter()
        const saved = state.ops.find(o => o.table === 'messages' && o.op === 'insert' && o.row?.role === 'assistant')
        expect(saved?.row?.id).toBe(done.messageId)
    })

    it('「쉬는 중」 답은 저장하지 않고, 먼저 저장한 사용자 말을 되돌린다(사용량 차감 안 함)', async () => {
        state.answer = [UNAVAILABLE]
        const ev = await readUntilDone(await POST(req({ messages: [{ role: 'user', content: '질문' }], mentorId: 'm', sessionId: SESSION })))
        expect(ev.find(e => e.done)?.messageId).toBeUndefined()
        await flushAfter()
        const userInsert = state.ops.find(o => o.table === 'messages' && o.op === 'insert' && o.row?.role === 'user')
        const del = state.ops.find(o => o.table === 'messages' && o.op === 'delete')
        expect(del?.filters?.id).toBe(userInsert?.row?.id)
        expect(state.ops.find(o => o.table === 'messages' && o.op === 'insert' && o.row?.role === 'assistant')).toBeUndefined()
    })

    it('모델에 대화 마감 시각(시작+55초)과 줄인 지난 대화를 넘긴다', async () => {
        const many = Array.from({ length: 100 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `말${i}` }))
        many.push({ role: 'user', content: '마지막' })
        const started = Date.now()
        await readUntilDone(await POST(req({ messages: many, mentorId: 'm', sessionId: SESSION })))
        const call = state.llmCalls[0]
        expect(typeof call.opts.deadline).toBe('number')
        expect(call.opts.deadline as number).toBeGreaterThan(started + 50_000)
        expect(call.opts.deadline as number).toBeLessThanOrEqual(Date.now() + 55_000)
        expect(call.history.length).toBeLessThanOrEqual(40)
        expect((call.history.at(-1) as { content: string }).content).toBe('마지막')
    })
})

describe('자료 0건 점검은 대화 경로에서 뺐다 (코드 모양)', () => {
    it('표 전체 개수를 세지 않고, 응답 뒤에 100번 중 1번만', async () => {
        const { readFileSync } = await import('node:fs')
        const src = readFileSync('src/app/api/chat/route.ts', 'utf8')
        expect(src).not.toContain('전체원장건수')
        expect(src).not.toContain('전체조각건수')
        expect(src).toContain('keepAliveAfterResponse(logZeroHitDiagnosis(')
        expect(src).toMatch(/ZERO_HIT_DIAG_RATE = 0\.01/)
    })
})

describe('검토 수정 (2026-10-06)', () => {
    beforeEach(() => { state.user = ME })

    it('사용량을 못 읽으면(null) 한도·예산 검사를 건너뛰지 않고 한도 안내로 막는다', async () => {
        state.usage = null
        const ev = await readUntilDone(await POST(req({ messages: [{ role: 'user', content: '질문' }], mentorId: 'm', sessionId: SESSION })))
        expect(ev[0]).toMatchObject({ done: true, usageLimit: true })
        expect(state.llmCalls).toHaveLength(0)
    })

    it('요금제를 못 읽었으면(planUnknown) 한도는 막지 않지만 예산 판정에선 유료로 치지 않는다', async () => {
        vi.stubEnv('AI_BUDGET_MONTHLY_KRW', '100')
        state.monthCost = 95
        state.usage = { plan: 'pro', planUnknown: true, blocked: false, resetAt: new Date() }
        const ev = await readUntilDone(await POST(req({ messages: [{ role: 'user', content: '질문' }], mentorId: 'm', sessionId: SESSION })))
        expect(ev[0]).toMatchObject({ done: true, budgetPaused: true })
        resetBudgetCacheForTest()
        state.usage = { plan: 'pro', blocked: false, resetAt: new Date() }
        const ev2 = await readUntilDone(await POST(req({ messages: [{ role: 'user', content: '질문' }], mentorId: 'm', sessionId: SESSION })))
        expect(ev2.at(-1)).toMatchObject({ done: true, fullResponse: '안녕하세요' })
    })

    it('한도 넘긴 대화(클로버 차감)에서 화면이 끝 신호 전에 나가도, 답이 만들어졌으면 클로버를 돌려주지 않는다', async () => {
        state.usage = { plan: 'free', blocked: true, resetAt: new Date() }
        state.answer = ['한', '참', '긴', '답']
        const res = await POST(req({ messages: [{ role: 'user', content: '질문' }], mentorId: 'm', sessionId: SESSION, cloverOk: true }))
        const reader = res.body!.getReader()
        await reader.read()          // 첫 조각만 받고
        await reader.cancel()        // 화면을 나간다
        await new Promise(r => setTimeout(r, 20))
        await flushAfter()
        expect(state.rpcCalls).toContain('spend_clovers_for_chat')
        expect(state.rpcCalls).not.toContain('클로버_더하기')
        expect(state.ops.some(o => o.table === 'messages' && o.op === 'insert' && o.row?.role === 'assistant')).toBe(true)
    })

    it('답을 못 만들면(쉬는 중) 차감한 클로버를 돌려준다', async () => {
        state.usage = { plan: 'free', blocked: true, resetAt: new Date() }
        state.answer = [UNAVAILABLE]
        await readUntilDone(await POST(req({ messages: [{ role: 'user', content: '질문' }], mentorId: 'm', sessionId: SESSION, cloverOk: true })))
        await flushAfter()
        expect(state.rpcCalls).toContain('클로버_더하기')
    })
})
