// 봇 신고, 차단 (애플 심사 지침 1.2, 1002). DB, 로그인, 공개 관문은 가짜.
// 2차(리뷰 반영): 자동 내림은 로그인 회원만 세고 서로 다른 인터넷 주소 3개 이상, 손님은 관리자 목록만,
// 주인 없는 봇, 시연 봇, 예시 봇은 자동으로 안 내린다, 관리자가 닫은 신고자는 30일 안 다시 안 센다.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const unpublishForReports = vi.fn<(...a: unknown[]) => Promise<boolean>>(async () => true)
const unpublishByAdmin = vi.fn(async () => undefined)
const decideReview = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({ status: 'approved' as const }))
const releaseHold = vi.fn(async () => true)
const isBotHeld = vi.fn<(...a: unknown[]) => Promise<boolean>>(async () => false)
const openReviewOf = vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => null)
vi.mock('../publish-gate', () => ({
    unpublishForReports: (...a: unknown[]) => unpublishForReports(...a),
    unpublishByAdmin: (...a: unknown[]) => unpublishByAdmin(...(a as [])),
    decideReview: (...a: unknown[]) => decideReview(...a),
    releaseHold: (...a: unknown[]) => releaseHold(...(a as [])),
    isBotHeld: (...a: unknown[]) => isBotHeld(...a),
    REPORT_REVIEW_CATEGORY: 'user_reports',
}))
vi.mock('../moderation', () => ({ openReviewOf: (...a: unknown[]) => openReviewOf(...a) }))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

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
let adminUser: { id: string } | null = { id: 'admin' }
vi.mock('@/lib/admin-guard', () => ({ requireAdminAPI: async () => (adminUser ? { user: adminUser } : { error: 'Forbidden', status: 403 }) }))
vi.mock('@/domains/mentor', () => ({ getActiveMentors: async () => [{ id: M1, name: '봇1', creator_id: null }, { id: M2, name: '봇2', creator_id: null }] }))
vi.mock('@/domains/os/team-link', () => ({ getLinkCounts: async () => new Map() }))
vi.mock('@/domains/os/showcase', async (orig) => {
    const real = await orig<typeof import('@/domains/os/showcase')>()
    return { ...real, arrangeMarket: <T,>(x: T) => x }
})

import {
    parseReportBody, cleanVisitorId, countAutoReporters, shouldAutoUnpublish, submitReport, groupReports, handleReports,
    hashIp, AUTO_UNPUBLISH_WINDOW_MS, ReportTableMissing,
} from '../reports'
import { listBlockedMentorIds, isBotBlocked, withoutBlocked, blockBot, unblockBot } from '../blocks'
import { assertBotInTeam, BotNotMine } from '../knowledge'
import { POST as reportPost } from '@/app/api/os/report/route'
import { GET as blockGet, POST as blockPost, DELETE as blockDelete } from '@/app/api/os/block/route'
import { GET as marketGet } from '@/app/api/os/market/route'
import { POST as adminReportsPost } from '@/app/api/admin/os/reports/route'

const M1 = '11111111-1111-4111-8111-111111111111'
const M2 = '22222222-2222-4222-8222-222222222222'
const M3 = '33333333-3333-4333-8333-333333333333'
const SAMPLE = 'b453ce4e-2bb3-4c10-8618-75037dcb292a'   // 예시 봇 (showcase SAMPLE_MARKET_IDS)
const MSG = '44444444-4444-4444-8444-444444444444'

type Op = { op: string; args: unknown[] }
type Row = Record<string, unknown>
/** 표마다 줄을 기억하는 가짜 DB (eq, gte, in 만 거른다) */
function fakeDb(init: { [table: string]: Row[] | string[] | undefined; missing?: string[] } = {}) {
    const tables: Record<string, Row[]> = {
        bot_reports: [], user_bot_blocks: [], team_bots: [], bot_routines: [], messages: [], chat_sessions: [],
        channel_messages: [], channels: [], creator_profiles: [], users: [],
        mentors: [
            { id: M1, name: '봇1', title: '', is_active: true, avatar_url: null, creator_id: 'cp1', slug: 'os-1' },
            { id: M2, name: '봇2', title: '', is_active: true, avatar_url: null, creator_id: 'cp2', slug: 'os-2' },
        ],
    }
    for (const [k, v] of Object.entries(init)) if (k !== 'missing' && v) tables[k] = v as Row[]
    let clock = 0
    const resolve = (table: string, ops: Op[]) => {
        if (init.missing?.includes(table)) return { data: null, error: { code: '42P01', message: 'missing' } }
        const rows = tables[table] ?? (tables[table] = [])
        const match = (r: Row) => ops.every(o => {
            if (o.op === 'eq') return r[o.args[0] as string] === o.args[1]
            if (o.op === 'gte') return r[o.args[0] as string] != null && String(r[o.args[0] as string]) >= String(o.args[1])
            if (o.op === 'in') return (o.args[1] as unknown[]).includes(r[o.args[0] as string])
            return true
        })
        const ins = ops.find(o => o.op === 'insert' || o.op === 'upsert')
        if (ins) {
            const row: Row = { id: `r${clock}`, status: 'open', created_at: new Date(Date.UTC(2026, 9, 2, 0, 0, clock++)).toISOString(), ...(ins.args[0] as Row) }
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

const NOW = Date.UTC(2026, 9, 2, 12, 0, 0)
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const base = { mentorId: M1, reason: 'spam' as const, detail: null, messageExcerpt: null, messageId: null }
const user = (id: string, ip: string | null) => ({ ...base, reporterUserId: id, reporterVisitorId: null, ipHash: ip })
const guest = (v: string, ip: string | null) => ({ ...base, reporterUserId: null, reporterVisitorId: v, ipHash: ip })

beforeEach(() => {
    currentUser = null
    adminUser = { id: 'admin' }
    adminDb = fakeDb()
    rateCalls.length = 0
    rateAllowed = () => true
    for (const f of [unpublishForReports, unpublishByAdmin, decideReview, releaseHold, revalidatePath]) f.mockClear()
    isBotHeld.mockReset(); isBotHeld.mockResolvedValue(false)
    openReviewOf.mockReset(); openReviewOf.mockResolvedValue(null)
})

describe('신고 몸통 검사', () => {
    it('맞는 몸통은 통과, 발췌는 1000자로 자른다', () => {
        const r = parseReportBody({ mentorId: M1, reason: 'spam', detail: ' 광고만 해요 ', messageExcerpt: 'x'.repeat(1500), messageId: MSG })
        expect(r.ok).toBe(true)
        if (r.ok) { expect(r.value.detail).toBe('광고만 해요'); expect(r.value.messageExcerpt).toHaveLength(1000); expect(r.value.messageId).toBe(MSG) }
    })
    it('메시지 id 가 uuid 가 아니면 버린다(거절하지 않는다)', () => {
        const r = parseReportBody({ mentorId: M1, reason: 'spam', messageId: 'tmp-123' })
        expect(r.ok && r.value.messageId === null).toBe(true)
    })
    it('봇 id 가 uuid 가 아니면 거절', () => expect(parseReportBody({ mentorId: 'abc', reason: 'spam' }).ok).toBe(false))
    it('모르는 이유는 거절', () => expect(parseReportBody({ mentorId: M1, reason: 'boring' }).ok).toBe(false))
    it('설명 500자 넘으면 거절', () => expect(parseReportBody({ mentorId: M1, reason: 'other', detail: 'a'.repeat(501) }).ok).toBe(false))
    it('몸통이 없어도 던지지 않는다', () => expect(parseReportBody(null).ok).toBe(false))
    it('방문자 id 다듬기', () => {
        expect(cleanVisitorId('3f2a-uuid')).toBe('3f2a-uuid')
        expect(cleanVisitorId('')).toBeNull()
        expect(cleanVisitorId('a b')).toBeNull()
        expect(cleanVisitorId('x'.repeat(65))).toBeNull()
    })
    it('인터넷 주소는 소금 친 sha256 으로만 남는다', () => {
        const h = hashIp('1.2.3.4', 's1')
        expect(h).toMatch(/^[0-9a-f]{64}$/)
        expect(h).toBe(hashIp('1.2.3.4', 's1'))
        expect(h).not.toBe(hashIp('1.2.3.4', 's2'))
        expect(h).not.toContain('1.2.3.4')
        expect(hashIp(null, 's1')).toBeNull()
    })
})

describe('자동 내림 기준 = 7일 안 로그인 회원 3명 + 서로 다른 인터넷 주소 3개', () => {
    const row = (u: string | null, ip: string | null, msAgo = 1000, extra: Row = {}) =>
        ({ reporter_user_id: u, reporter_visitor_id: u ? null : 'v', ip_hash: ip, created_at: ago(msAgo), status: 'open', ...extra })
    it('손님은 안 센다 (방문자 id 를 바꿔 여러 명인 척해도)', () => {
        const rows = [row(null, 'a'), row(null, 'b'), row(null, 'c'), row('u1', 'd'), row('u2', 'e')]
        expect(countAutoReporters(rows, NOW).users).toBe(2)
        expect(shouldAutoUnpublish(rows, NOW)).toBe(false)
    })
    it('회원 3명이어도 인터넷 주소가 같으면 안 내린다', () => {
        const rows = [row('u1', 'a'), row('u2', 'a'), row('u3', 'b')]
        expect(countAutoReporters(rows, NOW)).toEqual({ users: 3, ips: 2 })
        expect(shouldAutoUnpublish(rows, NOW)).toBe(false)
    })
    it('회원 3명 + 주소 3개 = 내린다', () => expect(shouldAutoUnpublish([row('u1', 'a'), row('u2', 'b'), row('u3', 'c')], NOW)).toBe(true))
    it('같은 회원 여러 번은 1명', () => expect(countAutoReporters([row('u1', 'a'), row('u1', 'b'), row('u1', 'c')], NOW).users).toBe(1))
    it('7일 지난 신고, 닫힌 신고, 제외된 신고자는 안 센다', () => {
        const rows = [row('u1', 'a'), row('u2', 'b', AUTO_UNPUBLISH_WINDOW_MS + 1000), row('u3', 'c', 1000, { status: 'dismissed' }), row('u4', 'd')]
        expect(countAutoReporters(rows, NOW, new Set(['u4'])).users).toBe(1)
    })
})

describe('submitReport', () => {
    it('회원 3명 + 주소 3개가 모이면 공개 관문으로 내린다 (지우지 않는다)', async () => {
        expect((await submitReport(adminDb.db, user('u1', 'a'), NOW)).autoUnpublished).toBe(false)
        expect((await submitReport(adminDb.db, user('u2', 'b'), NOW)).autoUnpublished).toBe(false)
        expect((await submitReport(adminDb.db, user('u3', 'c'), NOW)).autoUnpublished).toBe(true)
        expect(unpublishForReports).toHaveBeenCalledWith(adminDb.db, M1, 3)
        expect(adminDb.tables.mentors).toHaveLength(2)
    })
    it('손님 신고는 아무리 많아도 관리자 목록에만 간다', async () => {
        for (const v of ['v1', 'v2', 'v3', 'v4', 'v5']) await submitReport(adminDb.db, guest(v, v), NOW)
        await submitReport(adminDb.db, user('u1', 'a'), NOW)
        await submitReport(adminDb.db, user('u2', 'b'), NOW)
        expect(unpublishForReports).not.toHaveBeenCalled()
        expect(adminDb.tables.bot_reports).toHaveLength(7)
    })
    it('주인 없는 봇, 시연 봇, 예시 봇은 자동으로 안 내린다', async () => {
        adminDb = fakeDb({
            mentors: [
                { id: M1, name: '옛봇', is_active: true, creator_id: null, slug: 'mentor-old' },
                { id: M2, name: '기획팀장', is_active: true, creator_id: 'cp9', slug: 'os-demo-plan' },
                { id: SAMPLE, name: '예시', is_active: true, creator_id: 'cp9', slug: 'sample' },
            ],
        })
        for (const id of [M1, M2, SAMPLE]) {
            for (const [u, ip] of [['u1', 'a'], ['u2', 'b'], ['u3', 'c']]) await submitReport(adminDb.db, { ...user(u!, ip!), mentorId: id }, NOW)
        }
        expect(unpublishForReports).not.toHaveBeenCalled()
        expect(adminDb.tables.bot_reports).toHaveLength(9)
    })
    it('관리자가 30일 안에 닫은 신고자는 다시 세지 않는다', async () => {
        adminDb = fakeDb({ bot_reports: [{ id: 'old', mentor_id: M1, reporter_user_id: 'u1', reason: 'spam', status: 'dismissed', handled_at: ago(5 * 86_400_000), created_at: ago(6 * 86_400_000), ip_hash: 'a' }] })
        await submitReport(adminDb.db, user('u1', 'a'), NOW)
        await submitReport(adminDb.db, user('u2', 'b'), NOW)
        await submitReport(adminDb.db, user('u3', 'c'), NOW)
        expect(unpublishForReports).not.toHaveBeenCalled()
        await submitReport(adminDb.db, user('u4', 'd'), NOW)
        expect(unpublishForReports).toHaveBeenCalledWith(adminDb.db, M1, 3)
    })
    it('메시지 id 가 내 대화의 봇 말이면 서버가 진짜 글을 꺼낸다', async () => {
        adminDb.tables.chat_sessions.push({ id: 's1', user_id: 'u1', mentor_id: M1 })
        adminDb.tables.messages.push({ id: MSG, session_id: 's1', role: 'assistant', content: '진짜 봇 말' })
        await submitReport(adminDb.db, { ...user('u1', 'a'), messageId: MSG, messageExcerpt: '조작한 말' }, NOW)
        expect(adminDb.tables.bot_reports[0]).toMatchObject({ message_excerpt: '진짜 봇 말', excerpt_source: 'server' })
    })
    it('남의 대화 메시지 id 면 신고자가 보낸 인용으로 남긴다', async () => {
        adminDb.tables.chat_sessions.push({ id: 's1', user_id: 'someone', mentor_id: M1 })
        adminDb.tables.messages.push({ id: MSG, session_id: 's1', role: 'assistant', content: '남의 대화' })
        await submitReport(adminDb.db, { ...user('u1', 'a'), messageId: MSG, messageExcerpt: '보낸 인용' }, NOW)
        expect(adminDb.tables.bot_reports[0]).toMatchObject({ message_excerpt: '보낸 인용', excerpt_source: 'reporter' })
    })
    it('단체방 봇 말도 내 방이면 꺼낸다', async () => {
        adminDb.tables.channels.push({ id: 'c1', user_id: 'u1' })
        adminDb.tables.channel_messages.push({ id: MSG, channel_id: 'c1', author_kind: 'bot', mentor_id: M1, content: '방에서 한 말' })
        await submitReport(adminDb.db, { ...user('u1', 'a'), messageId: MSG }, NOW)
        expect(adminDb.tables.bot_reports[0]).toMatchObject({ message_excerpt: '방에서 한 말', excerpt_source: 'server' })
    })
    it('회원이면 방문자 id 는 저장하지 않는다, 주소 지문은 저장한다', async () => {
        await submitReport(adminDb.db, { ...user('u1', 'hash1'), reporterVisitorId: 'v9' }, NOW)
        expect(adminDb.tables.bot_reports[0]).toMatchObject({ reporter_user_id: 'u1', reporter_visitor_id: null, ip_hash: 'hash1' })
    })
    it('표가 없으면 ReportTableMissing', async () => {
        adminDb = fakeDb({ missing: ['bot_reports'] })
        await expect(submitReport(adminDb.db, user('u1', 'a'), NOW)).rejects.toBeInstanceOf(ReportTableMissing)
    })
})

describe('차단', () => {
    it('표가 없으면 빈 목록 = 대화를 막지 않는다', async () => {
        adminDb = fakeDb({ missing: ['user_bot_blocks'] })
        expect((await listBlockedMentorIds(adminDb.db, 'u1')).size).toBe(0)
        expect(await isBotBlocked(adminDb.db, 'u1', M1)).toBe(false)
    })
    it('내 차단만 빠진다', async () => {
        adminDb = fakeDb({ user_bot_blocks: [{ user_id: 'u1', mentor_id: M1 }, { user_id: 'u2', mentor_id: M2 }] })
        expect(withoutBlocked([{ id: M1 }, { id: M2 }], await listBlockedMentorIds(adminDb.db, 'u1'), b => b.id)).toEqual([{ id: M2 }])
    })
    it('차단 = 팀 줄 숨김 + 그 봇 루틴 멈춤, 해제 = 원래대로', async () => {
        adminDb = fakeDb({
            team_bots: [{ id: 't1', user_id: 'u1', mentor_id: M1, hidden: false }],
            bot_routines: [
                { id: 'r1', user_id: 'u1', mentor_id: M1, enabled: true },
                { id: 'r2', user_id: 'u1', mentor_id: M1, enabled: false },
                { id: 'r3', user_id: 'u1', mentor_id: M2, enabled: true },
            ],
        })
        await blockBot(adminDb.db, 'u1', M1)
        expect(adminDb.tables.team_bots[0]!.hidden).toBe(true)
        expect(adminDb.tables.bot_routines.map(r => r.enabled)).toEqual([false, false, true])
        await blockBot(adminDb.db, 'u1', M1)   // 두 번 눌러도 처음 상태를 덮지 않는다
        await unblockBot(adminDb.db, 'u1', M1)
        expect(adminDb.tables.team_bots[0]!.hidden).toBe(false)
        expect(adminDb.tables.bot_routines.map(r => r.enabled)).toEqual([true, false, true])
        expect(adminDb.tables.user_bot_blocks).toHaveLength(0)
    })
    it('원래 숨겨 둔 봇은 해제해도 숨긴 채로', async () => {
        adminDb = fakeDb({ team_bots: [{ id: 't1', user_id: 'u1', mentor_id: M1, hidden: true }] })
        await blockBot(adminDb.db, 'u1', M1)
        await unblockBot(adminDb.db, 'u1', M1)
        expect(adminDb.tables.team_bots[0]!.hidden).toBe(true)
    })
    it('팀 확인(전달, 멘션, 초안, 자료)이 차단한 봇을 거절한다', async () => {
        adminDb = fakeDb({ team_bots: [{ id: 't1', user_id: 'u1', mentor_id: M1, hidden: false }] })
        await expect(assertBotInTeam(adminDb.db, 'u1', M1)).resolves.toBeUndefined()
        await blockBot(adminDb.db, 'u1', M1)
        await expect(assertBotInTeam(adminDb.db, 'u1', M1)).rejects.toBeInstanceOf(BotNotMine)
    })
})

describe('POST /api/os/report', () => {
    it('손님은 visitorId 가 있어야 한다', async () => {
        expect((await reportPost(req('/api/os/report', 'POST', { mentorId: M1, reason: 'spam' }))).status).toBe(400)
    })
    it('손님 신고 = 방문자 열쇠 + 주소 열쇠, 주소는 지문만 저장', async () => {
        const res = await reportPost(req('/api/os/report', 'POST', { mentorId: M1, reason: 'spam', visitorId: 'v-1' }, { 'x-forwarded-for': '1.2.3.4' }))
        expect(res.status).toBe(200)
        expect((await res.json()).message).toBe('신고했어요. 24시간 안에 확인할게요')
        expect(rateCalls.map(c => c.key)).toEqual(['report:v:v-1', 'report-ip:ip:1.2.3.4'])
        const saved = adminDb.tables.bot_reports[0]!
        expect(saved).toMatchObject({ reporter_visitor_id: 'v-1', mentor_id: M1 })
        expect(saved.ip_hash).toMatch(/^[0-9a-f]{64}$/)
        expect(JSON.stringify(saved)).not.toContain('1.2.3.4')
    })
    it('회원 신고는 visitorId 를 같이 보내도 회원으로 센다', async () => {
        currentUser = { id: 'u1' }
        const res = await reportPost(req('/api/os/report', 'POST', { mentorId: M1, reason: 'sexual', visitorId: 'ios-v', detail: '이상해요' }))
        expect(res.status).toBe(200)
        expect(rateCalls.map(c => c.key)).toEqual(['report:u:u1'])
        expect(adminDb.tables.bot_reports[0]).toMatchObject({ reporter_user_id: 'u1', reporter_visitor_id: null, detail: '이상해요' })
    })
    it('없는 봇이어도 똑같이 200 (있는지 없는지 새지 않게), 저장은 안 함', async () => {
        currentUser = { id: 'u1' }
        const res = await reportPost(req('/api/os/report', 'POST', { mentorId: M3, reason: 'spam' }))
        expect(res.status).toBe(200)
        expect((await res.json()).message).toBe('신고했어요. 24시간 안에 확인할게요')
        expect(adminDb.tables.bot_reports).toHaveLength(0)
    })
    it('자동으로 내렸으면 마켓, 홈 캐시를 비운다', async () => {
        adminDb = fakeDb({ bot_reports: [
            { id: 'a', mentor_id: M1, reporter_user_id: 'u1', status: 'open', created_at: new Date().toISOString(), ip_hash: 'x1' },
            { id: 'b', mentor_id: M1, reporter_user_id: 'u2', status: 'open', created_at: new Date().toISOString(), ip_hash: 'x2' },
        ] })
        currentUser = { id: 'u3' }
        await reportPost(req('/api/os/report', 'POST', { mentorId: M1, reason: 'hate' }, { 'x-forwarded-for': '9.9.9.9' }))
        expect(unpublishForReports).toHaveBeenCalled()
        expect(revalidatePath).toHaveBeenCalledWith('/os/market')
        expect(revalidatePath).toHaveBeenCalledWith('/home')
    })
    it('너무 잦으면 429, 저장 안 함', async () => {
        currentUser = { id: 'u1' }
        rateAllowed = () => false
        expect((await reportPost(req('/api/os/report', 'POST', { mentorId: M1, reason: 'spam' }))).status).toBe(429)
        expect(adminDb.tables.bot_reports).toHaveLength(0)
    })
    it('틀린 이유는 400, 표가 없으면 503', async () => {
        currentUser = { id: 'u1' }
        expect((await reportPost(req('/api/os/report', 'POST', { mentorId: M1, reason: 'nope' }))).status).toBe(400)
        adminDb = fakeDb({ missing: ['bot_reports'] })
        expect((await reportPost(req('/api/os/report', 'POST', { mentorId: M1, reason: 'spam' }))).status).toBe(503)
    })
})

describe('/api/os/block', () => {
    it('로그인 안 하면 401', async () => {
        expect((await blockPost(req('/api/os/block', 'POST', { mentorId: M1 }))).status).toBe(401)
        expect((await blockGet()).status).toBe(401)
    })
    it('차단 → 목록 → 해제 (?mentorId= 로도)', async () => {
        currentUser = { id: 'u1' }
        expect((await blockPost(req('/api/os/block', 'POST', { mentorId: M1 }))).status).toBe(200)
        expect((await blockPost(req('/api/os/block', 'POST', { mentorId: M1 }))).status).toBe(200)
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
        expect((await blockPost(req('/api/os/block', 'POST', { mentorId: M3 }))).status).toBe(404)
    })
})

describe('GET /api/os/market 은 차단한 봇을 뺀다', () => {
    it('회원 u1 이 봇1 을 차단했으면 봇2 만', async () => {
        currentUser = { id: 'u1' }
        adminDb = fakeDb({ user_bot_blocks: [{ user_id: 'u1', mentor_id: M1 }] })
        expect((await (await marketGet()).json()).bots.map((b: { mentorId: string }) => b.mentorId)).toEqual([M2])
    })
    it('손님은 다 본다', async () => expect((await (await marketGet()).json()).bots).toHaveLength(2))
})

describe('관리자 조치', () => {
    const open = (id: string, u: string, reason = 'spam', extra: Row = {}) => ({ id, mentor_id: M1, reporter_user_id: u, reporter_visitor_id: null, reason, status: 'open', created_at: '2026-10-01T00:00:00Z', detail: null, message_excerpt: '봇 말', excerpt_source: 'reporter', ...extra })
    it('봇마다 묶고 이유를 센다, 발췌 출처를 붙인다', () => {
        const g = groupReports([open('a', 'u1'), open('b', 'u2', 'hate', { excerpt_source: 'server' }), open('c', 'u2')] as never, new Map([[M1, { name: '봇1', title: 't', is_active: false }]]))
        expect(g[0]).toMatchObject({ mentorId: M1, count: 3, reporterCount: 2, isActive: false })
        expect(g[0]!.reasons[0]).toMatchObject({ reason: 'spam', label: '스팸, 광고', count: 2 })
        expect(g[0]!.items.find(i => i.id === 'b')!.excerptFromServer).toBe(true)
        expect(g[0]!.items.find(i => i.id === 'a')!.excerptFromServer).toBe(false)
    })
    it('내리기 = 공개 관문 + 신고 조치됨', async () => {
        adminDb = fakeDb({ bot_reports: [open('a', 'u1'), open('b', 'u2')] })
        const r = await handleReports(adminDb.db, 'admin', M1, 'unpublish')
        expect(unpublishByAdmin).toHaveBeenCalled()
        expect(r.closed).toBe(2)
        expect(adminDb.tables.bot_reports.every(x => x.status === 'actioned' && x.handled_by === 'admin')).toBe(true)
    })
    it('유지 = 신고로 내려간 봇이면 관문 승인으로 다시 공개', async () => {
        adminDb = fakeDb({ bot_reports: [open('a', 'u1')] })
        openReviewOf.mockResolvedValue({ mentorId: M1, categories: ['user_reports'], reasons: [], requestedAt: '', contentHash: 'h' })
        const r = await handleReports(adminDb.db, 'admin', M1, 'keep')
        expect(decideReview).toHaveBeenCalledWith(adminDb.db, 'admin', M1, 'approve')
        expect(r).toMatchObject({ closed: 1, republished: true })
        expect(adminDb.tables.bot_reports[0]!.status).toBe('dismissed')
    })
    it('유지 = 확인 대기는 없는데 묶여 있으면 묶음만 푼다', async () => {
        adminDb = fakeDb({ bot_reports: [open('a', 'u1')] })
        isBotHeld.mockResolvedValue(true)
        await handleReports(adminDb.db, 'admin', M1, 'keep')
        expect(decideReview).not.toHaveBeenCalled()
        expect(releaseHold).toHaveBeenCalled()
    })
    it('유지 = 시연 봇이면 공개를 건드리지 않고 친절한 안내', async () => {
        adminDb = fakeDb({ bot_reports: [open('a', 'u1')], mentors: [{ id: M1, name: '기획팀장', slug: 'os-demo-plan', creator_id: 'cp', is_active: true }] })
        openReviewOf.mockResolvedValue({ mentorId: M1, categories: ['user_reports'], reasons: [], requestedAt: '', contentHash: 'h' })
        const r = await handleReports(adminDb.db, 'admin', M1, 'keep')
        expect(decideReview).not.toHaveBeenCalled()
        expect(r.note).toContain('시연용')
        expect(r.closed).toBe(1)
    })
    it('닫기 = 봇은 그대로, 신고만 닫음', async () => {
        adminDb = fakeDb({ bot_reports: [open('a', 'u1')] })
        await handleReports(adminDb.db, 'admin', M1, 'dismiss')
        expect(unpublishByAdmin).not.toHaveBeenCalled()
        expect(decideReview).not.toHaveBeenCalled()
        expect(adminDb.tables.bot_reports[0]!.status).toBe('dismissed')
    })
    it('관리자 창구: 내리기, 유지는 마켓, 홈 캐시를 비운다', async () => {
        adminDb = fakeDb({ bot_reports: [open('a', 'u1')] })
        const res = await adminReportsPost(req('/api/admin/os/reports', 'POST', { mentorId: M1, action: 'unpublish' }))
        expect(res.status).toBe(200)
        expect(revalidatePath).toHaveBeenCalledWith('/os/market')
        expect(revalidatePath).toHaveBeenCalledWith('/home')
    })
})
