// 새로 만든 봇이 잃어버리던 것 3가지 (1001): 링크 자료, 공개하기, 예시 질문과 한 줄 소개. 인터넷, DB 는 가짜.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const readUrl = vi.fn()
const addKnowledgeSource = vi.fn<(...a: unknown[]) => Promise<{ id: string }>>(async () => ({ id: 'src1' }))
const ensureCreatorProfile = vi.fn(async () => ({ id: 'cp1' }))
vi.mock('../readers', () => ({ readUrl: (...a: unknown[]) => readUrl(...a), KNOWLEDGE_READ_OPTIONS: { maxBytes: 1, timeoutMs: 45_000, maxChars: 100_000 } }))
vi.mock('@/domains/knowledge', () => ({ addKnowledgeSource: (...a: unknown[]) => addKnowledgeSource(...a) }))
vi.mock('@/domains/creator', () => ({ ensureCreatorProfile: () => ensureCreatorProfile() }))

import { addDraftSources } from '../knowledge'
import { createTeamBot, updateTeamBot, listTeam, BotPublishDenied } from '../team'
import { starterTasksFor, STARTER_TASKS, COMMON_STARTERS } from '../presets'
import { tasksFor } from '@/components/os/FirstTaskChips'

beforeEach(() => { readUrl.mockReset(); addKnowledgeSource.mockClear(); ensureCreatorProfile.mockClear() })

/**
 * 표마다 돌려줄 값을 정하는 가짜 DB. 부른 내역(calls)을 표 이름별로 남긴다.
 * results[표] = 그 표에서 await/single/maybeSingle 할 때 줄 값 (배열이면 차례로 꺼낸다)
 */
type Call = { table: string; op: string; args: unknown[] }
function fakeDb(results: Record<string, unknown | unknown[]>) {
    const calls: Call[] = []
    const rpc = vi.fn<(...a: unknown[]) => Promise<{ data: null; error: null }>>(async () => ({ data: null, error: null }))
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
        expect(r).toEqual({ added: 2, failed: 0 })
        // 인스타그램은 주소만으로 못 읽으니 링크 자료로 넣지 않는다 (글은 붙여넣은 글로 들어간다)
        expect(readUrl).toHaveBeenCalledTimes(1)
        const types = addKnowledgeSource.mock.calls.map(c => c[4])
        expect(types.sort()).toEqual(['text', 'url'])
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

    it('updateTeamBot: 한 줄 소개를 바꾸면 마켓에 보이는 mentors.title, description 도 바꾼다', async () => {
        const { db, calls } = fakeDb({
            team_bots: [{ error: null }, { data: { mentor_id: 'm1' }, error: null }],
            creator_profiles: { data: { id: 'cp1' }, error: null },
            mentors: { error: null },
        })
        await updateTeamBot(db, 'u1', 't1', { oneLiner: '팬 질문에 답해요' })
        const up = calls.find(c => c.table === 'mentors' && c.op === 'update')!
        expect(up.args[0]).toMatchObject({ title: '팬 질문에 답해요', description: '팬 질문에 답해요' })
        expect(calls).toContainEqual({ table: 'mentors', op: 'eq', args: ['creator_id', 'cp1'] })
    })

    it('updateTeamBot: 크리에이터 프로필이 없는 사람이 한 줄 소개만 바꾸면 팀 줄만 바꾸고 실패하지 않는다', async () => {
        const { db, calls } = fakeDb({
            team_bots: [{ error: null }, { data: { mentor_id: 'm1' }, error: null }],
            creator_profiles: { data: null, error: null },
        })
        await expect(updateTeamBot(db, 'u1', 't1', { oneLiner: '새 소개' })).resolves.toBeUndefined()
        expect(calls.some(c => c.table === 'mentors' && c.op === 'update')).toBe(false)
    })
})

describe('FIX 2 — 공개하기 (내가 만든 봇만)', () => {
    const ownBot = (over: Record<string, unknown> = {}) => ({
        team_bots: { data: { mentor_id: 'm1', linked_from_market: false }, error: null },
        creator_profiles: { data: { id: 'cp1' }, error: null },
        mentors: [{ data: { id: 'm1', creator_id: 'cp1', slug: 'os-1-ab', is_active: false }, error: null }, { error: null }],
        app_events: [{ data: [], error: null }, { error: null }],
        ...over,
    })

    it('처음 공개하면 is_active=true, status=active 로 바꾸고 mentor_count 를 하나 올린다', async () => {
        const { db, calls, rpc } = fakeDb(ownBot())
        await updateTeamBot(db, 'u1', 't1', { isPublic: true })
        const up = calls.find(c => c.table === 'mentors' && c.op === 'update')!
        expect(up.args[0]).toMatchObject({ is_active: true, status: 'active' })
        expect(calls).toContainEqual({ table: 'mentors', op: 'eq', args: ['creator_id', 'cp1'] })
        expect(rpc).toHaveBeenCalledWith('increment_mentor_count', { p_creator_id: 'cp1' })
    })

    it('전에 공개한 적이 있으면(다시 공개) mentor_count 를 또 올리지 않는다', async () => {
        const { db, rpc } = fakeDb(ownBot({ app_events: { data: [{ id: 'e1' }], error: null } }))
        await updateTeamBot(db, 'u1', 't1', { isPublic: true })
        expect(rpc).not.toHaveBeenCalled()
    })

    it('비공개로 돌리면 is_active=false 만 바꾸고 mentor_count 는 그대로 (옛 편집 화면과 같다)', async () => {
        const { db, calls, rpc } = fakeDb(ownBot({
            mentors: [{ data: { id: 'm1', creator_id: 'cp1', slug: 'os-1-ab', is_active: true }, error: null }, { error: null }],
        }))
        await updateTeamBot(db, 'u1', 't1', { isPublic: false })
        const up = calls.find(c => c.table === 'mentors' && c.op === 'update')!
        expect(up.args[0]).toMatchObject({ is_active: false })
        expect(up.args[0]).not.toHaveProperty('status')
        expect(rpc).not.toHaveBeenCalled()
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
