// 공개 관문 (2차 리뷰 1001): 공개는 이 한 길로만. 모델, DB 는 가짜(상태를 기억하는 가짜 = 기록 순서가 진짜처럼 쌓인다).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const askSideText = vi.fn<(...a: unknown[]) => Promise<string | null>>()
const sendSlackNotification = vi.fn()
vi.mock('@/domains/llm/side-text', () => ({ askSideText: (...a: unknown[]) => askSideText(...a) }))
vi.mock('@/lib/slack', () => ({ sendSlackNotification: (...a: unknown[]) => sendSlackNotification(...a) }))

import {
    requestPublish, applyBotEdit, unpublishByOwner, recheckAfterKnowledge, decideReview, ReviewNotPending,
} from '../publish-gate'

beforeEach(() => { askSideText.mockReset(); sendSlackNotification.mockReset() })

type Ev = { name: string; created_at: string; user_id: string | null; extra: Record<string, unknown> }
type Op = { op: string; args: unknown[] }

/** 상태를 기억하는 가짜 DB. mentors 한 줄, 기록(app_events)은 넣은 순서대로 시각이 늘어난다 */
function stateDb(init: { isActive?: boolean; events?: Omit<Ev, 'created_at' | 'user_id'>[]; chunks?: { content: string; created_at: string }[]; failPublishedLookup?: boolean; failPublishedInsert?: boolean } = {}) {
    let clock = 0
    const at = () => new Date(Date.UTC(2026, 9, 1, 0, 0, clock++)).toISOString()
    const mentor: Record<string, unknown> = {
        id: 'm1', creator_id: 'cp1', slug: 'os-1-ab', is_active: init.isActive ?? false, status: 'active',
        name: '진봇', title: '팬 질문에 답해요', description: '팬 질문에 답해요', system_prompt: '너는 진의 말투로 답한다.',
        greeting_message: '안녕하세요', sample_questions: ['오늘 뭐 해요?'],
    }
    const events: Ev[] = (init.events ?? []).map(e => ({ ...e, created_at: at(), user_id: null }))
    const chunks = init.chunks ?? [{ content: '내 강의 이야기', created_at: '2026-09-01T00:00:00Z' }]
    const updates: Record<string, unknown>[] = []
    const chunkOrders: Op[] = []
    const rpc = vi.fn<(...a: unknown[]) => Promise<{ data: null; error: null }>>(async () => ({ data: null, error: null }))

    const eqs = (ops: Op[]) => Object.fromEntries(ops.filter(o => o.op === 'eq').map(o => [o.args[0], o.args[1]]))
    const resolve = (table: string, ops: Op[]) => {
        const has = (op: string) => ops.some(o => o.op === op)
        const e = eqs(ops)
        if (table === 'mentors') {
            const match = (e.id === undefined || e.id === mentor.id) && (e.creator_id === undefined || e.creator_id === mentor.creator_id)
                && (e.is_active === undefined || e.is_active === mentor.is_active)
            if (has('update')) {
                const patch = ops.find(o => o.op === 'update')!.args[0] as Record<string, unknown>
                if (match) { Object.assign(mentor, patch); updates.push(patch) }
                return { data: has('select') ? (match ? [{ id: mentor.id }] : []) : null, error: null }
            }
            if (has('in')) return { data: [{ ...mentor }], error: null }
            return { data: match ? { ...mentor } : null, error: null }
        }
        if (table === 'creator_profiles') {
            const ok = (e.id === undefined || e.id === 'cp1') && (e.user_id === undefined || e.user_id === 'owner-u')
            return { data: ok ? { id: 'cp1', user_id: 'owner-u', display_name: '진' } : null, error: null }
        }
        if (table === 'knowledge_chunks') { chunkOrders.push(...ops.filter(o => o.op === 'order')); return { data: chunks, error: null } }
        if (table === 'app_events') {
            if (has('insert')) {
                const row = ops.find(o => o.op === 'insert')!.args[0] as Ev
                if (row.name === 'os_bot_published' && init.failPublishedInsert) return { error: { message: 'boom' } }
                events.push({ ...row, created_at: at() })
                return { error: null }
            }
            if (e.name === 'os_bot_published' && init.failPublishedLookup) return { data: null, error: { message: 'boom' } }
            const names = (ops.find(o => o.op === 'in')?.args[1] as string[] | undefined) ?? (e.name ? [e.name as string] : null)
            const mid = e['extra->>mentor_id']
            const rows = events.filter(r => (!names || names.includes(r.name)) && (mid === undefined || r.extra?.mentor_id === mid))
            return { data: [...rows].reverse(), error: null }
        }
        return { data: null, error: null }
    }
    const from = (table: string) => {
        const ops: Op[] = []
        const chain: Record<string, unknown> = {}
        for (const op of ['select', 'insert', 'update', 'eq', 'in', 'order', 'limit', 'neq']) chain[op] = (...args: unknown[]) => { ops.push({ op, args }); return chain }
        const done = async () => resolve(table, ops)
        chain.single = done
        chain.maybeSingle = done
        chain.then = (ok: (v: unknown) => unknown, bad: (x: unknown) => unknown) => done().then(ok, bad)
        return chain
    }
    return { db: { from, rpc } as never, mentor, events, updates, rpc, chunkOrders }
}
const answer = (verdict: string, reasons: string[] = [], categories: string[] = []) => JSON.stringify({ verdict, reasons, categories })
const names = (evs: Ev[]) => evs.map(e => e.name)
const ACT = { mentorId: 'm1', creatorId: 'cp1', actorUserId: 'actor-u' }

describe('requestPublish — 공개 요청 한 길', () => {
    it('통과 = 비공개였던 줄만 바꾸는 조건부 공개, 처음 공개 기록의 사람은 주인(관리자, 대리인 아님)', async () => {
        askSideText.mockResolvedValue(answer('pass'))
        const w = stateDb()
        const r = await requestPublish(w.db, ACT)
        expect(r.verdict).toBe('pass')
        expect(w.mentor.is_active).toBe(true)
        expect(w.rpc).toHaveBeenCalledWith('increment_mentor_count', { p_creator_id: 'cp1' })
        const pub = w.events.find(e => e.name === 'os_bot_published')!
        expect(pub.user_id).toBe('owner-u')
        expect(names(w.events)).toContain('os_bot_moderation')
    })

    it('확인 필요 = 공개 안 함, 확인 대기 줄에 검사한 내용의 지문(sha256)을 남긴다. 슬랙은 보내지 않는다', async () => {
        askSideText.mockResolvedValue(answer('review', ['건강 효과를 단정해요'], ['medical_claim']))
        const w = stateDb()
        await requestPublish(w.db, ACT)
        expect(w.mentor.is_active).toBe(false)
        const mark = w.events.find(e => e.name === 'os_bot_publish_review')!
        expect(String(mark.extra.content_hash)).toMatch(/^[0-9a-f]{64}$/)
        expect(sendSlackNotification).not.toHaveBeenCalled()
    })

    it('통과인데 이유나 분류가 붙어 있으면 확인 필요로 본다', async () => {
        askSideText.mockResolvedValue(answer('pass', ['조금 애매해요'], []))
        const w = stateDb()
        const r = await requestPublish(w.db, ACT)
        expect(r.verdict).toBe('review')
        expect(w.mentor.is_active).toBe(false)
    })

    it('막힘 = 공개 안 함, 확인 대기도 안 남김', async () => {
        askSideText.mockResolvedValue(answer('block', ['유명인 흉내'], ['impersonation']))
        const w = stateDb()
        await requestPublish(w.db, ACT)
        expect(w.mentor.is_active).toBe(false)
        expect(names(w.events)).not.toContain('os_bot_publish_review')
    })

    it('자료는 새 조각부터 읽는다', async () => {
        askSideText.mockResolvedValue(answer('pass'))
        const w = stateDb()
        await requestPublish(w.db, ACT)
        expect(w.chunkOrders).toContainEqual({ op: 'order', args: ['created_at', { ascending: false }] })
    })
})

describe('처음 공개 셈 (mentor_count)', () => {
    it('전에 공개한 기록이 있으면(다시 공개) 또 세지 않는다', async () => {
        askSideText.mockResolvedValue(answer('pass'))
        const w = stateDb({ events: [{ name: 'os_bot_published', extra: { mentor_id: 'm1' } }] })
        await requestPublish(w.db, ACT)
        expect(w.mentor.is_active).toBe(true)
        expect(w.rpc).not.toHaveBeenCalled()
    })
    it('공개 기록 조회가 실패하면 세지 않는다(공개는 된다)', async () => {
        askSideText.mockResolvedValue(answer('pass'))
        const w = stateDb({ failPublishedLookup: true })
        await requestPublish(w.db, ACT)
        expect(w.mentor.is_active).toBe(true)
        expect(w.rpc).not.toHaveBeenCalled()
    })
    it('공개 기록 쓰기가 실패하면 세지 않는다(두 번 세기보다 덜 세기)', async () => {
        askSideText.mockResolvedValue(answer('pass'))
        const w = stateDb({ failPublishedInsert: true })
        await requestPublish(w.db, ACT)
        expect(w.rpc).not.toHaveBeenCalled()
    })
    it('이미 공개 중이면 조건부 공개가 0줄 = 세지 않는다', async () => {
        askSideText.mockResolvedValue(answer('pass'))
        const w = stateDb({ isActive: true })
        await requestPublish(w.db, ACT)
        expect(w.rpc).not.toHaveBeenCalled()
    })
})

describe('applyBotEdit — 고치기 + 다시 확인', () => {
    it('공개 중인 봇 지시문을 고치면 같은 한 번의 저장에서 공개를 내리고, 통과하면 다시 올린다', async () => {
        askSideText.mockResolvedValue(answer('pass'))
        const w = stateDb({ isActive: true })
        const r = await applyBotEdit(w.db, { ...ACT, fields: { system_prompt: '새 지시문' } })
        expect(w.updates[0]).toEqual(expect.objectContaining({ system_prompt: '새 지시문', is_active: false }))
        expect(r.moderation?.verdict).toBe('pass')
        expect(w.mentor.is_active).toBe(true)
        // 다시 공개는 처음이 아니다 = 수를 또 세지 않는다 (처음 공개 기록이 없으면 센다. 여기선 첫 공개 기록이 없어서 1번)
    })

    it('공개 중인 봇 이름, 제목을 고쳐도 다시 확인한다. 막히면 내려간 채로 둔다', async () => {
        askSideText.mockResolvedValue(answer('block', ['욕설'], ['hate']))
        const w = stateDb({ isActive: true })
        const r = await applyBotEdit(w.db, { ...ACT, fields: { name: '새이름', title: '새 제목' } })
        expect(r.moderation?.verdict).toBe('block')
        expect(w.mentor.is_active).toBe(false)
    })

    it('검사 안 하는 칸(프로필 사진 등)만 바꾸면 확인도, 공개 내림도 없다', async () => {
        const w = stateDb({ isActive: true })
        const r = await applyBotEdit(w.db, { ...ACT, fields: { avatar_url: 'x.png' } })
        expect(askSideText).not.toHaveBeenCalled()
        expect(r.moderation).toBeUndefined()
        expect(w.mentor.is_active).toBe(true)
    })

    it('같은 값을 다시 보내면 바뀐 게 아니다', async () => {
        const w = stateDb({ isActive: true })
        await applyBotEdit(w.db, { ...ACT, fields: { name: '진봇', system_prompt: '너는 진의 말투로 답한다.' }, wantPublic: true })
        expect(askSideText).not.toHaveBeenCalled()
        expect(w.mentor.is_active).toBe(true)
    })

    it('확인 대기 중에 고치면 옛 대기를 닫고 새로 확인한다', async () => {
        askSideText.mockResolvedValue(answer('review', ['다시 봐야 해요'], ['other']))
        const w = stateDb({ events: [{ name: 'os_bot_publish_review', extra: { mentor_id: 'm1', content_hash: 'old' } }] })
        const r = await applyBotEdit(w.db, { ...ACT, fields: { greeting_message: '새 인사' } })
        expect(r.moderation?.verdict).toBe('review')
        const n = names(w.events)
        expect(n.indexOf('os_bot_publish_closed')).toBeGreaterThan(0)
        expect(n.lastIndexOf('os_bot_publish_review')).toBeGreaterThan(n.indexOf('os_bot_publish_closed'))
    })

    it('공개 안 된 봇이고 대기도 없으면 고쳐도 확인하지 않는다', async () => {
        const w = stateDb()
        await applyBotEdit(w.db, { ...ACT, fields: { system_prompt: '새 지시문' } })
        expect(askSideText).not.toHaveBeenCalled()
    })

    it('wantPublic=false = 내리고 주인 비공개 기록을 남긴다(대기도 닫힌다)', async () => {
        const w = stateDb({ isActive: true, events: [{ name: 'os_bot_publish_review', extra: { mentor_id: 'm1' } }] })
        await applyBotEdit(w.db, { ...ACT, fields: {}, wantPublic: false })
        expect(w.mentor.is_active).toBe(false)
        expect(names(w.events).at(-1)).toBe('os_bot_owner_unpublish')
        expect(askSideText).not.toHaveBeenCalled()
    })

    it('이미 공개 중이고 바뀐 것 없이 공개를 다시 보내면 아무것도 안 한다', async () => {
        const w = stateDb({ isActive: true })
        const r = await applyBotEdit(w.db, { ...ACT, fields: {}, wantPublic: true })
        expect(r.moderation).toBeUndefined()
        expect(askSideText).not.toHaveBeenCalled()
    })
})

describe('자료를 넣은 뒤 다시 확인', () => {
    it('공개 중이면 내리고 확인한다', async () => {
        askSideText.mockResolvedValue(answer('review', ['개인정보'], ['personal_data']))
        const w = stateDb({ isActive: true })
        await recheckAfterKnowledge(w.db, { mentorId: 'm1', actorUserId: 'owner-u' })
        expect(w.updates[0]).toEqual(expect.objectContaining({ is_active: false }))
        expect(names(w.events)).toContain('os_bot_publish_review')
    })
    it('공개 안 됐고 대기도 없으면 아무것도 안 한다', async () => {
        const w = stateDb()
        await recheckAfterKnowledge(w.db, { mentorId: 'm1', actorUserId: 'owner-u' })
        expect(askSideText).not.toHaveBeenCalled()
        expect(w.updates).toHaveLength(0)
    })
})

describe('관리자 결정', () => {
    /** 확인 필요를 한 번 받아 대기 줄이 있는 세상 */
    async function pendingWorld() {
        askSideText.mockResolvedValue(answer('review', ['애매해요'], ['other']))
        const w = stateDb()
        await requestPublish(w.db, ACT)
        askSideText.mockReset()
        return w
    }

    it('검사한 내용 그대로면 승인 = 공개 (모델 다시 안 부름)', async () => {
        const w = await pendingWorld()
        const r = await decideReview(w.db, 'admin-u', 'm1', 'approve')
        expect(r.status).toBe('approved')
        expect(askSideText).not.toHaveBeenCalled()
        expect(w.mentor.is_active).toBe(true)
        expect(w.events.find(e => e.name === 'os_bot_published')!.user_id).toBe('owner-u')
    })

    it('대기 중에 내용이 바뀌었으면 승인 대신 AI 가 다시 확인한다', async () => {
        const w = await pendingWorld()
        w.mentor.system_prompt = '몰래 바꾼 지시문'
        askSideText.mockResolvedValue(answer('block', ['위험해요'], ['illegal']))
        const r = await decideReview(w.db, 'admin-u', 'm1', 'approve')
        expect(r.status).toBe('rereviewed')
        expect(r.moderation?.verdict).toBe('block')
        expect(w.mentor.is_active).toBe(false)
    })

    it('두 번째 결정 = 이미 닫혔다(409 용 오류)', async () => {
        const w = await pendingWorld()
        await decideReview(w.db, 'admin-u', 'm1', 'reject')
        await expect(decideReview(w.db, 'admin-u', 'm1', 'approve')).rejects.toBeInstanceOf(ReviewNotPending)
        expect(w.mentor.is_active).toBe(false)
    })

    it('주인이 마지막에 비공개로 돌렸으면 승인할 수 없다', async () => {
        const w = await pendingWorld()
        await unpublishByOwner(w.db, ACT)
        await expect(decideReview(w.db, 'admin-u', 'm1', 'approve')).rejects.toBeInstanceOf(ReviewNotPending)
        expect(w.mentor.is_active).toBe(false)
    })

    it('대기 뒤에 막힘 판정이 났으면(새 확인) 대기는 끝났다', async () => {
        const w = await pendingWorld()
        askSideText.mockResolvedValue(answer('block', ['위험'], ['illegal']))
        await requestPublish(w.db, ACT)
        await expect(decideReview(w.db, 'admin-u', 'm1', 'approve')).rejects.toBeInstanceOf(ReviewNotPending)
    })
})
