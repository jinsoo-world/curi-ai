// 봇 신고, 차단 (애플 심사 지침 1.2, 1002). DB, 로그인, 공개 관문은 가짜.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const unpublishForReports = vi.fn<(...a: unknown[]) => Promise<boolean>>(async () => true)
const unpublishByAdmin = vi.fn(async () => undefined)
const decideReview = vi.fn(async () => ({ status: 'approved' as const }))
const openReviewOf = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => null)
vi.mock('../publish-gate', () => ({
    unpublishForReports: (...a: unknown[]) => unpublishForReports(...a),
    unpublishByAdmin: (...a: unknown[]) => unpublishByAdmin(...(a as [])),
    decideReview: (...a: unknown[]) => decideReview(...(a as [])),
    REPORT_REVIEW_CATEGORY: 'user_reports',
}))
vi.mock('../moderation', () => ({ openReviewOf: (...a: unknown[]) => openReviewOf(...a) }))

let currentUser: { id: string } | null = null
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: currentUser } }) } }) }))
let adminDb: ReturnType<typeof fakeDb>
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminDb.db }))
const rateCalls: { key: string; limit: number; windowSec: number }[] = []
let rateAllowed: (key: string) => boolean = () => true
vi.mock('@/lib/rate-limit', async (orig) => {
    const real = await orig<typeof import('@/lib/rate-limit')>()
    return {
        ...real,
        checkRateLimit: async (_db: unknown, key: string, limit: number, windowSec: number) => {
            rateCalls.push({ key, limit, windowSec })
            return { allowed: rateAllowed(key), remaining: 0 }
        },
    }
})
vi.mock('@/domains/mentor', () => ({ getActiveMentors: async () => [{ id: M1, name: '봇1', creator_id: null }, { id: M2, name: '봇2', creator_id: null }] }))
vi.mock('@/domains/os/team-link', () => ({ getLinkCounts: async () => new Map() }))
vi.mock('@/domains/os/showcase', () => ({ arrangeMarket: <T,>(x: T) => x }))

import {
    parseReportBody, cleanVisitorId, countDistinctReporters, shouldAutoUnpublish, withoutBlocked, submitReport,
    listBlockedMentorIds, isBotBlocked, groupReports, handleReports, AUTO_UNPUBLISH_WINDOW_MS, ReportTableMissing,
} from '../reports'
import { POST as reportPost } from '@/app/api/os/report/route'
import { GET as blockGet, POST as blockPost, DELETE as blockDelete } from '@/app/api/os/block/route'
import { GET as marketGet } from '@/app/api/os/market/route'

const M1 = '11111111-1111-4111-8111-111111111111'
const M2 = '22222222-2222-4222-8222-222222222222'

type Op = { op: string; args: unknown[] }
/** 표마다 줄을 기억하는 가짜 DB (eq, gte, in 만 거른다) */
function fakeDb(init: { reports?: Record<string, unknown>[]; blocks?: Record<string, unknown>[]; mentors?: Record<string, unknown>[]; missing?: string[] } = {}) {
    const tables: Record<string, Record<string, unknown>[]> = {
        bot_reports: init.reports ?? [],
        user_bot_blocks: init.blocks ?? [],
        mentors: init.mentors ?? [{ id: M1, name: '봇1', title: '', is_active: true, avatar_url: null }, { id: M2, name: '봇2', title: '', is_active: true, avatar_url: null }],
        team_bots: [], creator_profiles: [], users: [],
    }
    let clock = 0
    const resolve = (table: string, ops: Op[]) => {
        if (init.missing?.includes(table)) return { data: null, error: { code: '42P01', message: 'missing' } }
        const rows = tables[table] ?? []
        const match = (r: Record<string, unknown>) => ops.every(o => {
            if (o.op === 'eq') return r[o.args[0] as string] === o.args[1]
            if (o.op === 'gte') return String(r[o.args[0] as string]) >= String(o.args[1])
            if (o.op === 'in') return (o.args[1] as unknown[]).includes(r[o.args[0] as string])
            return true
        })
        const ins = ops.find(o => o.op === 'insert' || o.op === 'upsert')
        if (ins) {
            const row: Record<string, unknown> = { id: `r${clock}`, status: 'open', created_at: new Date(Date.UTC(2026, 9, 2, 0, 0, clock++)).toISOString(), ...(ins.args[0] as Record<string, unknown>) }
            if (table === 'user_bot_blocks' && rows.some(r => r.user_id === row.user_id && r.mentor_id === row.mentor_id)) return { data: null, error: null }
            rows.push(row)
            return { data: null, error: null }
        }
        const upd = ops.find(o => o.op === 'update')
        if (upd) {
            const hit = rows.filter(match)
            for (const r of hit) Object.assign(r, upd.args[0])
            return { data: hit.map(r => ({ id: r.id })), error: null }
        }
        if (ops.some(o => o.op === 'delete')) {
            tables[table] = rows.filter(r => !match(r))
            return { data: null, error: null }
        }
        return { data: rows.filter(match).map(r => ({ ...r })), error: null }
    }
    const from = (table: string) => {
        const ops: Op[] = []
        const chain: Record<string, unknown> = {}
        for (const op of ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'in', 'gte', 'order', 'limit', 'not']) chain[op] = (...args: unknown[]) => { ops.push({ op, args }); return chain }
        chain.maybeSingle = async () => { const r = resolve(table, ops); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error } }
        chain.then = (ok: (v: unknown) => unknown, bad: (x: unknown) => unknown) => Promise.resolve(resolve(table, ops)).then(ok, bad)
        return chain
    }
    return { db: { from } as never, tables }
}

const req = (url: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
    new Request(`http://x${url}`, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })

beforeEach(() => {
    currentUser = null
    adminDb = fakeDb()
    rateCalls.length = 0
    rateAllowed = () => true
    unpublishForReports.mockClear(); unpublishByAdmin.mockClear(); decideReview.mockClear(); openReviewOf.mockReset(); openReviewOf.mockResolvedValue(null)
})

describe('신고 몸통 검사', () => {
    it('맞는 몸통은 통과, 발췌는 1000자로 자른다', () => {
        const r = parseReportBody({ mentorId: M1, reason: 'spam', detail: ' 광고만 해요 ', messageExcerpt: 'x'.repeat(1500) })
        expect(r.ok).toBe(true)
        if (r.ok) { expect(r.value.detail).toBe('광고만 해요'); expect(r.value.messageExcerpt).toHaveLength(1000) }
    })
    it('봇 id 가 uuid 가 아니면 거절', () => expect(parseReportBody({ mentorId: 'abc', reason: 'spam' }).ok).toBe(false))
    it('모르는 이유는 거절', () => expect(parseReportBody({ mentorId: M1, reason: 'boring' }).ok).toBe(false))
    it('설명 500자 넘으면 거절', () => expect(parseReportBody({ mentorId: M1, reason: 'other', detail: 'a'.repeat(501) }).ok).toBe(false))
    it('빈 설명, 빈 발췌는 null', () => {
        const r = parseReportBody({ mentorId: M1, reason: 'hate', detail: '  ' })
        expect(r.ok && r.value.detail === null && r.value.messageExcerpt === null).toBe(true)
    })
    it('몸통이 없어도 던지지 않는다', () => expect(parseReportBody(null).ok).toBe(false))
    it('방문자 id 다듬기', () => {
        expect(cleanVisitorId('3f2a-uuid')).toBe('3f2a-uuid')
        expect(cleanVisitorId('')).toBeNull()
        expect(cleanVisitorId('a b')).toBeNull()
        expect(cleanVisitorId('x'.repeat(65))).toBeNull()
        expect(cleanVisitorId(3)).toBeNull()
    })
})

describe('자동 내림 기준 (7일 안 서로 다른 신고자 3명)', () => {
    const now = Date.parse('2026-10-02T00:00:00Z')
    const at = (msAgo: number) => new Date(now - msAgo).toISOString()
    it('같은 사람이 여러 번 신고해도 1명', () => {
        const rows = [1, 2, 3].map(i => ({ reporter_user_id: 'u1', reporter_visitor_id: null, created_at: at(i * 1000) }))
        expect(countDistinctReporters(rows, now)).toBe(1)
        expect(shouldAutoUnpublish(rows, now)).toBe(false)
    })
    it('회원 2 + 손님 1 = 3명이면 내린다', () => {
        const rows = [
            { reporter_user_id: 'u1', reporter_visitor_id: null, created_at: at(1000) },
            { reporter_user_id: 'u2', reporter_visitor_id: null, created_at: at(2000) },
            { reporter_user_id: null, reporter_visitor_id: 'v1', created_at: at(3000) },
        ]
        expect(shouldAutoUnpublish(rows, now)).toBe(true)
    })
    it('7일 지난 신고, 닫힌 신고는 안 센다', () => {
        const rows = [
            { reporter_user_id: 'u1', reporter_visitor_id: null, created_at: at(1000) },
            { reporter_user_id: 'u2', reporter_visitor_id: null, created_at: at(AUTO_UNPUBLISH_WINDOW_MS + 1000) },
            { reporter_user_id: 'u3', reporter_visitor_id: null, created_at: at(1000), status: 'dismissed' },
        ]
        expect(countDistinctReporters(rows, now)).toBe(1)
    })
})

describe('submitReport', () => {
    it('3번째 서로 다른 신고에서 공개 관문으로 내린다 (지우지 않는다)', async () => {
        const now = Date.UTC(2026, 9, 2, 0, 1, 0)
        const base = { mentorId: M1, reason: 'spam' as const, detail: null, messageExcerpt: null }
        expect((await submitReport(adminDb.db, { ...base, reporterUserId: 'u1', reporterVisitorId: null }, now)).autoUnpublished).toBe(false)
        expect((await submitReport(adminDb.db, { ...base, reporterUserId: 'u1', reporterVisitorId: null }, now)).autoUnpublished).toBe(false)
        expect((await submitReport(adminDb.db, { ...base, reporterUserId: null, reporterVisitorId: 'v1' }, now)).autoUnpublished).toBe(false)
        expect(unpublishForReports).not.toHaveBeenCalled()
        expect((await submitReport(adminDb.db, { ...base, reporterUserId: 'u2', reporterVisitorId: null }, now)).autoUnpublished).toBe(true)
        expect(unpublishForReports).toHaveBeenCalledWith(adminDb.db, M1, 3)
        expect(adminDb.tables.bot_reports).toHaveLength(4)
        expect(adminDb.tables.mentors).toHaveLength(2)
    })
    it('회원이면 방문자 id 는 저장하지 않는다', async () => {
        await submitReport(adminDb.db, { mentorId: M1, reason: 'other', detail: null, messageExcerpt: null, reporterUserId: 'u1', reporterVisitorId: 'v9' })
        expect(adminDb.tables.bot_reports[0]).toMatchObject({ reporter_user_id: 'u1', reporter_visitor_id: null })
    })
    it('표가 없으면 ReportTableMissing', async () => {
        adminDb = fakeDb({ missing: ['bot_reports'] })
        await expect(submitReport(adminDb.db, { mentorId: M1, reason: 'other', detail: null, messageExcerpt: null, reporterUserId: 'u1', reporterVisitorId: null })).rejects.toBeInstanceOf(ReportTableMissing)
    })
})

describe('차단 목록', () => {
    it('표가 없으면 빈 목록 = 대화를 막지 않는다', async () => {
        adminDb = fakeDb({ missing: ['user_bot_blocks'] })
        expect((await listBlockedMentorIds(adminDb.db, 'u1')).size).toBe(0)
        expect(await isBotBlocked(adminDb.db, 'u1', M1)).toBe(false)
    })
    it('손님은 차단이 없다', async () => expect(await isBotBlocked(adminDb.db, null, M1)).toBe(false))
    it('내 차단만 빠진다', async () => {
        adminDb = fakeDb({ blocks: [{ user_id: 'u1', mentor_id: M1 }, { user_id: 'u2', mentor_id: M2 }] })
        const blocked = await listBlockedMentorIds(adminDb.db, 'u1')
        expect(withoutBlocked([{ id: M1 }, { id: M2 }], blocked, b => b.id)).toEqual([{ id: M2 }])
    })
})

describe('POST /api/os/report', () => {
    it('손님은 visitorId 가 있어야 한다', async () => {
        const res = await reportPost(req('/api/os/report', 'POST', { mentorId: M1, reason: 'spam' }))
        expect(res.status).toBe(400)
    })
    it('손님 신고 = 방문자 열쇠 + 인터넷 주소 열쇠 둘 다 센다', async () => {
        const res = await reportPost(req('/api/os/report', 'POST', { mentorId: M1, reason: 'spam', visitorId: 'v-1' }, { 'x-forwarded-for': '1.2.3.4' }))
        expect(res.status).toBe(200)
        expect((await res.json()).message).toBe('신고했어요. 24시간 안에 확인할게요')
        expect(rateCalls.map(c => c.key)).toEqual(['report:v:v-1', 'report-ip:ip:1.2.3.4'])
        expect(adminDb.tables.bot_reports[0]).toMatchObject({ reporter_visitor_id: 'v-1', mentor_id: M1, reason: 'spam' })
    })
    it('회원 신고는 회원 열쇠 하나만', async () => {
        currentUser = { id: 'u1' }
        const res = await reportPost(req('/api/os/report', 'POST', { mentorId: M1, reason: 'sexual', detail: '이상해요', messageExcerpt: '봇 말' }))
        expect(res.status).toBe(200)
        expect(rateCalls.map(c => c.key)).toEqual(['report:u:u1'])
        expect(adminDb.tables.bot_reports[0]).toMatchObject({ reporter_user_id: 'u1', detail: '이상해요', message_excerpt: '봇 말' })
    })
    it('너무 잦으면 429, 저장 안 함', async () => {
        currentUser = { id: 'u1' }
        rateAllowed = () => false
        const res = await reportPost(req('/api/os/report', 'POST', { mentorId: M1, reason: 'spam' }))
        expect(res.status).toBe(429)
        expect(adminDb.tables.bot_reports).toHaveLength(0)
    })
    it('틀린 이유는 400, 없는 봇은 404', async () => {
        currentUser = { id: 'u1' }
        expect((await reportPost(req('/api/os/report', 'POST', { mentorId: M1, reason: 'nope' }))).status).toBe(400)
        expect((await reportPost(req('/api/os/report', 'POST', { mentorId: '33333333-3333-4333-8333-333333333333', reason: 'spam' }))).status).toBe(404)
    })
    it('표가 없으면 503', async () => {
        currentUser = { id: 'u1' }
        adminDb = fakeDb({ missing: ['bot_reports'] })
        expect((await reportPost(req('/api/os/report', 'POST', { mentorId: M1, reason: 'spam' }))).status).toBe(503)
    })
})

describe('/api/os/block', () => {
    it('로그인 안 하면 401', async () => {
        expect((await blockPost(req('/api/os/block', 'POST', { mentorId: M1 }))).status).toBe(401)
        expect((await blockGet()).status).toBe(401)
    })
    it('차단 → 목록 → 해제', async () => {
        currentUser = { id: 'u1' }
        expect((await blockPost(req('/api/os/block', 'POST', { mentorId: M1 }))).status).toBe(200)
        expect((await blockPost(req('/api/os/block', 'POST', { mentorId: M1 }))).status).toBe(200)   // 두 번 눌러도 한 줄
        expect(adminDb.tables.user_bot_blocks).toHaveLength(1)
        const list = await (await blockGet()).json()
        expect(list.mentorIds).toEqual([M1])
        expect(list.bots[0]).toMatchObject({ mentorId: M1, name: '봇1' })
        expect((await blockDelete(req(`/api/os/block?mentorId=${M1}`, 'DELETE'))).status).toBe(200)
        expect(adminDb.tables.user_bot_blocks).toHaveLength(0)
    })
    it('틀린 id 400, 없는 봇 404', async () => {
        currentUser = { id: 'u1' }
        expect((await blockPost(req('/api/os/block', 'POST', { mentorId: 'x' }))).status).toBe(400)
        expect((await blockPost(req('/api/os/block', 'POST', { mentorId: '33333333-3333-4333-8333-333333333333' }))).status).toBe(404)
    })
})

describe('GET /api/os/market 은 차단한 봇을 뺀다', () => {
    it('회원 u1 이 봇1 을 차단했으면 봇2 만', async () => {
        currentUser = { id: 'u1' }
        adminDb = fakeDb({ blocks: [{ user_id: 'u1', mentor_id: M1 }] })
        const data = await (await marketGet()).json()
        expect(data.bots.map((b: { mentorId: string }) => b.mentorId)).toEqual([M2])
    })
    it('손님은 다 본다', async () => {
        const data = await (await marketGet()).json()
        expect(data.bots).toHaveLength(2)
    })
})

describe('관리자 조치', () => {
    const open = (id: string, user: string, reason = 'spam') => ({ id, mentor_id: M1, reporter_user_id: user, reporter_visitor_id: null, reason, status: 'open', created_at: '2026-10-01T00:00:00Z', detail: null, message_excerpt: '봇 말' })
    it('봇마다 묶고 이유를 센다', () => {
        const g = groupReports([open('a', 'u1'), open('b', 'u2', 'hate'), open('c', 'u2')] as never, new Map([[M1, { name: '봇1', title: 't', is_active: false }]]))
        expect(g).toHaveLength(1)
        expect(g[0]).toMatchObject({ mentorId: M1, count: 3, reporterCount: 2, isActive: false })
        expect(g[0]!.reasons[0]).toMatchObject({ reason: 'spam', label: '스팸, 광고', count: 2 })
    })
    it('내리기 = 공개 관문 + 신고 조치됨', async () => {
        adminDb = fakeDb({ reports: [open('a', 'u1'), open('b', 'u2')] })
        const r = await handleReports(adminDb.db, 'admin', M1, 'unpublish')
        expect(unpublishByAdmin).toHaveBeenCalled()
        expect(r.closed).toBe(2)
        expect(adminDb.tables.bot_reports.every(x => x.status === 'actioned' && x.handled_by === 'admin')).toBe(true)
    })
    it('유지 = 신고로 자동으로 내려간 봇이면 다시 공개(관문 승인)', async () => {
        adminDb = fakeDb({ reports: [open('a', 'u1')] })
        openReviewOf.mockResolvedValue({ mentorId: M1, categories: ['user_reports'], reasons: [], requestedAt: '', contentHash: 'h' })
        const r = await handleReports(adminDb.db, 'admin', M1, 'keep')
        expect(decideReview).toHaveBeenCalledWith(adminDb.db, 'admin', M1, 'approve')
        expect(r).toEqual({ closed: 1, republished: true })
        expect(adminDb.tables.bot_reports[0]!.status).toBe('dismissed')
    })
    it('유지 = AI 확인 대기(신고 아님)는 건드리지 않는다', async () => {
        adminDb = fakeDb({ reports: [open('a', 'u1')] })
        openReviewOf.mockResolvedValue({ mentorId: M1, categories: ['sexual'], reasons: [], requestedAt: '', contentHash: 'h' })
        await handleReports(adminDb.db, 'admin', M1, 'keep')
        expect(decideReview).not.toHaveBeenCalled()
    })
    it('닫기 = 봇은 그대로, 신고만 닫음', async () => {
        adminDb = fakeDb({ reports: [open('a', 'u1')] })
        await handleReports(adminDb.db, 'admin', M1, 'dismiss')
        expect(unpublishByAdmin).not.toHaveBeenCalled()
        expect(decideReview).not.toHaveBeenCalled()
        expect(adminDb.tables.bot_reports[0]!.status).toBe('dismissed')
    })
})
