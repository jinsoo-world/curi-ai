// 새로 만든 봇이 잃어버리던 것 3가지 (1001): 링크 자료, 공개하기, 예시 질문과 한 줄 소개. 인터넷, DB 는 가짜.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const readUrl = vi.fn()
const addKnowledgeSource = vi.fn<(...a: unknown[]) => Promise<{ id: string }>>(async () => ({ id: 'src1' }))
const ensureCreatorProfile = vi.fn(async () => ({ id: 'cp1' }))
vi.mock('../readers', () => ({ readUrl: (...a: unknown[]) => readUrl(...a), KNOWLEDGE_READ_OPTIONS: { maxBytes: 1, timeoutMs: 45_000, maxChars: 100_000 } }))
vi.mock('@/domains/knowledge', () => ({ addKnowledgeSource: (...a: unknown[]) => addKnowledgeSource(...a) }))
vi.mock('@/domains/creator', () => ({ ensureCreatorProfile: () => ensureCreatorProfile() }))
// 공개, 다시 확인은 공개 관문(publish-gate.test.ts)이 따로 본다. 여기서는 team.ts 가 관문에 무엇을 넘기는지만 본다
const applyBotEdit = vi.fn<(...a: unknown[]) => Promise<{ moderation?: unknown }>>(async () => ({}))
vi.mock('../publish-gate', () => ({ applyBotEdit: (...a: unknown[]) => applyBotEdit(...a) }))
const gateArg = () => applyBotEdit.mock.calls.at(-1)![1] as { mentorId: string; creatorId: string; fields: Record<string, unknown>; wantPublic?: boolean }

import { addDraftSources } from '../knowledge'
import { createTeamBot, updateTeamBot, listTeam, BotPublishDenied } from '../team'
import { starterTasksFor, STARTER_TASKS, COMMON_STARTERS } from '../presets'
import { tasksFor } from '@/components/os/FirstTaskChips'

beforeEach(() => { readUrl.mockReset(); addKnowledgeSource.mockClear(); ensureCreatorProfile.mockClear(); applyBotEdit.mockClear() })

/**
 * 표마다 돌려줄 값을 정하는 가짜 DB. 부른 내역(calls)을 표 이름별로 남긴다.
 * results[표] = 그 표에서 await/single/maybeSingle 할 때 줄 값 (배열이면 차례로 꺼낸다)
 */
type Call = { table: string; op: string; args: unknown[] }
function fakeDb(results: Record<string, unknown | unknown[]>) {
    const calls: Call[] = []
    const rpc = vi.fn<(...a: unknown[]) => Promise<{ data: null; error: null }>>(async (...a) => { calls.push({ table: 'rpc', op: 'rpc', args: a }); return { data: null, error: null } })
    const take = (table: string) => {
        const r = results[table]
        if (Array.isArray(r)) return r.length > 1 ? r.shift() : r[0]
        return r ?? { data: null, error: null }
    }
    const from = (table: string) => {
        const chain: Record<string, unknown> = {}
        for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'or', 'order', 'like', 'not', 'limit']) {
            chain[op] = (...args: unknown[]) => { calls.push({ table, op, args }); return chain }
        }
        chain.single = async () => take(table)
        chain.maybeSingle = async () => take(table)
        chain.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(take(table)).then(ok, bad)
        return chain
    }
    return { db: { from, rpc } as never, calls, rpc }
}

describe('FIX 1 — 링크로 만든 봇은 읽은 링크와 붙여넣은 글을 자료로 갖는다', () => {
    it('읽을 수 있는 링크는 링크 자료로, 붙여넣은 글은 글 자료로 넣는다', async () => {
        readUrl.mockResolvedValue({ ok: true, url: 'https://blog.example.com/a', title: '내 블로그', text: '강의에서 나눈 이야기를 길게 정리했어요. '.repeat(5), kind: 'web' })
        const { db } = fakeDb({ knowledge_sources: { count: 0, error: null } })
        const r = await addDraftSources(db, 'm1', {
            links: ['https://blog.example.com/a', 'https://www.instagram.com/me/'],
            pastes: ['인스타에 올린 글을 붙여넣었어요. 오늘도 수강생과 이야기했어요.'],
            userId: 'u1',
        })
        // 1003 변경: 초안이 인스타그램 공개 계정을 읽으므로 봇 자료에도 넣는다 (예전엔 버려서 봇이 인스타 글을 못 찾았다)
        expect(r).toEqual({ added: 3, failed: 0 })
        expect(readUrl).toHaveBeenCalledTimes(2)
        const types = addKnowledgeSource.mock.calls.map(c => c[4])
        expect(types.sort()).toEqual(['text', 'url', 'url'])
        expect(addKnowledgeSource.mock.calls.every(c => c[1] === 'm1')).toBe(true)
    })

    it('하나가 실패해도 나머지는 넣고, 던지지 않는다', async () => {
        readUrl.mockResolvedValueOnce({ ok: false, reason: '못 읽었어요' })
        readUrl.mockResolvedValueOnce({ ok: true, url: 'https://b.example.com', title: 'b', text: '읽을 글이 충분히 긴 본문입니다. '.repeat(5), kind: 'web' })
        const { db } = fakeDb({ knowledge_sources: { count: 0, error: null } })
        const r = await addDraftSources(db, 'm1', { links: ['https://a.example.com', 'https://b.example.com'], pastes: [] })
        expect(r).toEqual({ added: 1, failed: 1 })
    })

    it('자료 자리(봇 하나당 10개)가 꽉 차면 넣지 않는다', async () => {
        const { db } = fakeDb({ knowledge_sources: { count: 10, error: null } })
        const r = await addDraftSources(db, 'm1', { links: ['https://a.example.com'], pastes: ['붙여넣은 글이 충분히 길어요. 열 글자 넘게.'] })
        expect(r.added).toBe(0)
        expect(addKnowledgeSource).not.toHaveBeenCalled()
    })

    it('느린 링크 읽기를 붙여넣은 글보다 먼저 시작한다', async () => {
        const order: string[] = []
        readUrl.mockImplementation(async () => { order.push('link'); return { ok: true, url: 'https://a.example.com', title: 'a', text: '충분히 긴 본문 글입니다. '.repeat(6), kind: 'web' } })
        addKnowledgeSource.mockImplementation(async (...a: unknown[]) => { if (a[4] === 'text') order.push('paste'); return { id: 'src1' } })
        const { db } = fakeDb({ knowledge_sources: { count: 0, error: null } })
        await addDraftSources(db, 'm1', { links: ['https://a.example.com'], pastes: ['붙여넣은 글이 충분히 길어요. 열 글자 넘게.'] })
        expect(order[0]).toBe('link')
        addKnowledgeSource.mockImplementation(async () => ({ id: 'src1' }))
    })

    it('사내망 주소, 주소 아닌 글은 열지 않는다. 주소 앞 https 가 빠져도 붙여서 읽는다', async () => {
        readUrl.mockResolvedValue({ ok: true, url: 'https://blog.example.com', title: 't', text: '충분히 긴 본문 글입니다. '.repeat(6), kind: 'web' })
        const { db } = fakeDb({ knowledge_sources: { count: 0, error: null } })
        await addDraftSources(db, 'm1', { links: ['http://127.0.0.1/x', '그냥 글', 'blog.example.com'], pastes: [] })
        expect(readUrl).toHaveBeenCalledTimes(1)
        expect(readUrl.mock.calls[0][0]).toBe('https://blog.example.com')
    })
})

describe('FIX 3 — 새 봇 예시 질문 = 그 일의 첫 칩 3개', () => {
    it('starterTasksFor: 맡은 일 칩, 팀장은 팀장 칩, 직접 쓴 일은 공통 칩', () => {
        expect(starterTasksFor('planning_lead')).toEqual(STARTER_TASKS.planning_lead)
        expect(starterTasksFor('custom')).toEqual(COMMON_STARTERS)
        expect(starterTasksFor('없는일')).toEqual(COMMON_STARTERS)
        expect(starterTasksFor('planning_lead', 'chief')).toEqual(STARTER_TASKS.chief)
    })

    it('화면 첫 칩(tasksFor)과 같은 글을 쓴다', () => {
        expect(tasksFor(null)).toEqual(COMMON_STARTERS)
    })

    it('createTeamBot 이 mentors.sample_questions 에 칩 3개를 넣는다', async () => {
        const { db, calls } = fakeDb({
            mentors: { data: { id: 'm1', name: '기획봇', avatar_url: null, greeting_message: '안녕' }, error: null },
            team_bots: { data: { id: 't1', role: 'helper', shape: 'circle', color: 'orange', one_liner: 'x', approval_mode: 'always_ask', pinned: false, hidden: false, sort_order: 0, created_at: '' }, error: null },
        })
        await createTeamBot(db, { id: 'u1', displayName: '진' }, { job: 'planning_lead', autonomy: 'always_ask', name: '기획봇', shape: 'circle', color: 'orange' })
        const ins = calls.find(c => c.table === 'mentors' && c.op === 'insert')!
        expect((ins.args[0] as { sample_questions: string[] }).sample_questions).toEqual(STARTER_TASKS.planning_lead)
    })

    it('updateTeamBot: 한 줄 소개를 바꾸면 마켓에 보이는 mentors.title, description 도 바꾼다(관문으로)', async () => {
        const { db } = fakeDb({
            team_bots: [{ error: null }, { data: { mentor_id: 'm1' }, error: null }],
            creator_profiles: { data: { id: 'cp1' }, error: null },
            mentors: { data: { slug: 'os-1-ab' }, error: null },
        })
        await updateTeamBot(db, 'u1', 't1', { oneLiner: '팬 질문에 답해요' })
        expect(gateArg()).toMatchObject({ mentorId: 'm1', creatorId: 'cp1', fields: { title: '팬 질문에 답해요', description: '팬 질문에 답해요' } })
        expect(gateArg().wantPublic).toBeUndefined()
    })

    it('updateTeamBot: 팀 화면에서 만든 봇(os-)이 아닌 리더 봇은 한 줄 소개를 바꿔도 마켓 제목, 설명을 안 건드린다', async () => {
        const { db, calls } = fakeDb({
            team_bots: [{ error: null }, { data: { mentor_id: 'm1' }, error: null }],
            creator_profiles: { data: { id: 'cp1' }, error: null },
            mentors: { data: { slug: 'creator-jin-123' }, error: null },
        })
        await updateTeamBot(db, 'u1', 't1', { oneLiner: '팬 질문에 답해요' })
        expect(calls).toContainEqual({ table: 'team_bots', op: 'update', args: [{ one_liner: '팬 질문에 답해요' }] })
        expect(gateArg().fields).toEqual({})
    })

    it('updateTeamBot: 리더 봇의 이름을 바꾸면 이름만 바꾸고 제목, 설명은 그대로', async () => {
        const { db } = fakeDb({
            team_bots: [{ error: null }, { data: { mentor_id: 'm1' }, error: null }],
            creator_profiles: { data: { id: 'cp1' }, error: null },
            mentors: { data: { slug: 'creator-jin-123' }, error: null },
        })
        await updateTeamBot(db, 'u1', 't1', { oneLiner: '새 소개', name: '새이름' })
        expect(gateArg().fields).toEqual({ name: '새이름' })
    })

    it('updateTeamBot: 남의 봇(내 크리에이터 번호로 안 잡힘)이면 몸은 관문에 안 보낸다', async () => {
        const { db } = fakeDb({
            team_bots: [{ error: null }, { data: { mentor_id: 'm1' }, error: null }],
            creator_profiles: { data: { id: 'cp1' }, error: null },
            mentors: { data: null, error: null },
        })
        await updateTeamBot(db, 'u1', 't1', { oneLiner: '새 소개' })
        expect(applyBotEdit).not.toHaveBeenCalled()
    })

    it('updateTeamBot: 크리에이터 프로필이 없는 사람이 한 줄 소개만 바꾸면 팀 줄만 바꾸고 실패하지 않는다', async () => {
        const { db } = fakeDb({
            team_bots: [{ error: null }, { data: { mentor_id: 'm1' }, error: null }],
            creator_profiles: { data: null, error: null },
        })
        await expect(updateTeamBot(db, 'u1', 't1', { oneLiner: '새 소개' })).resolves.toEqual({})
        expect(applyBotEdit).not.toHaveBeenCalled()
    })
})

describe('FIX 2 — 공개하기 (내가 만든 봇만)', () => {
    const ownBot = (over: Record<string, unknown> = {}) => ({
        team_bots: { data: { mentor_id: 'm1', linked_from_market: false }, error: null },
        creator_profiles: { data: { id: 'cp1' }, error: null },
        mentors: [{ data: { id: 'm1', creator_id: 'cp1', slug: 'os-1-ab', is_active: false }, error: null }, { data: [{ id: 'm1' }], error: null }],
        app_events: [{ data: [], error: null }, { error: null }],
        ...over,
    })

    it('공개하기 = 권한 확인 뒤 관문에 wantPublic=true 로 넘긴다 (AI 확인, 조건부 공개, 셈은 관문 몫)', async () => {
        applyBotEdit.mockResolvedValueOnce({ moderation: { verdict: 'pass', reasons: [], categories: [] } })
        const { db } = fakeDb(ownBot({ mentors: [{ data: { id: 'm1', creator_id: 'cp1', slug: 'os-1-ab', is_active: false }, error: null }, { data: { slug: 'os-1-ab' }, error: null }] }))
        const out = await updateTeamBot(db, 'u1', 't1', { isPublic: true })
        expect(gateArg()).toMatchObject({ mentorId: 'm1', creatorId: 'cp1', wantPublic: true, fields: {} })
        expect(out.moderation).toMatchObject({ verdict: 'pass' })
    })

    it('공개 권한이 없으면 같이 보낸 다른 칸도 하나도 안 바꾼다 (403 뒤 반쪽 저장 없음)', async () => {
        const { db, calls } = fakeDb(ownBot({ team_bots: { data: { mentor_id: 'm1', linked_from_market: true }, error: null } }))
        await expect(updateTeamBot(db, 'u1', 't1', { isPublic: true, pinned: true, name: '새이름', oneLiner: '새 소개' })).rejects.toBeInstanceOf(BotPublishDenied)
        expect(calls.some(c => c.op === 'update' || c.op === 'insert')).toBe(false)
        expect(applyBotEdit).not.toHaveBeenCalled()
    })

    it('비공개로 돌리기 = 관문에 wantPublic=false 로 넘긴다', async () => {
        const { db } = fakeDb(ownBot({ mentors: [{ data: { id: 'm1', creator_id: 'cp1', slug: 'os-1-ab', is_active: true }, error: null }, { data: { slug: 'os-1-ab' }, error: null }] }))
        await updateTeamBot(db, 'u1', 't1', { isPublic: false })
        expect(gateArg().wantPublic).toBe(false)
    })

    it('마켓에서 데려온 남의 봇은 공개할 수 없다', async () => {
        const { db, calls } = fakeDb(ownBot({ team_bots: { data: { mentor_id: 'm1', linked_from_market: true }, error: null } }))
        await expect(updateTeamBot(db, 'u1', 't1', { isPublic: true })).rejects.toBeInstanceOf(BotPublishDenied)
        expect(calls.some(c => c.table === 'mentors' && c.op === 'update')).toBe(false)
    })

    it('내가 만든 봇이 아니면(만든 사람이 다르면) 공개할 수 없다', async () => {
        const { db } = fakeDb(ownBot({ mentors: { data: { id: 'm1', creator_id: 'someone', slug: 'os-1-ab', is_active: false }, error: null } }))
        await expect(updateTeamBot(db, 'u1', 't1', { isPublic: true })).rejects.toBeInstanceOf(BotPublishDenied)
    })

    it('시연용 봇(os-demo-)은 공개할 수 없다', async () => {
        const { db } = fakeDb(ownBot({ mentors: { data: { id: 'm1', creator_id: 'cp1', slug: 'os-demo-plan', is_active: false }, error: null } }))
        await expect(updateTeamBot(db, 'u1', 't1', { isPublic: true })).rejects.toBeInstanceOf(BotPublishDenied)
    })

    it('내 팀에 없는 봇이면 공개할 수 없다', async () => {
        const { db } = fakeDb(ownBot({ team_bots: { data: null, error: null } }))
        await expect(updateTeamBot(db, 'u1', 't1', { isPublic: true })).rejects.toBeInstanceOf(BotPublishDenied)
    })

    it('listTeam 은 공개 상태(isPublic)와 공개할 수 있는지(canPublish)를 실어 온다', async () => {
        const row = (id: string, slug: string, linked: boolean, active: boolean) => ({
            id, mentor_id: `m-${id}`, role: 'helper', shape: 'circle', color: 'orange', one_liner: null, approval_mode: 'always_ask',
            pinned: false, hidden: false, sort_order: 0, created_at: '', linked_from_market: linked,
            mentors: { name: id, avatar_url: null, greeting_message: '', system_prompt: '', is_active: active, slug },
        })
        const { db } = fakeDb({
            team_bots: { data: [row('a', 'os-1', false, true), row('b', 'leader-x', true, true), row('c', 'os-demo-plan', false, false)], error: null },
            knowledge_sources: { data: [], error: null },
        })
        const team = await listTeam(db, 'u1')
        expect(team.map(t => [t.isPublic, t.canPublish])).toEqual([[true, true], [true, false], [false, false]])
    })
})
