import { describe, it, expect } from 'vitest'
import {
    ratio, shortId, truncate, maskRateKey, isTableMissing,
    startOfTodayKst, todayKstDate,
    teamStats, approvalStats, checkinStats, nextStepStats, messageStats, rateLimitTop, envPresence,
} from '../admin-stats'

describe('os/admin-stats — 관리자 봇 OS 숫자 계산', () => {
    it('비율은 분모를 같이 적고, 분모 0 이면 값 null', () => {
        expect(ratio(3, 10)).toEqual({ num: 3, den: 10, pct: 30, label: '3/10 (30.0%)' })
        expect(ratio(1, 3).label).toBe('1/3 (33.3%)')
        expect(ratio(0, 0)).toEqual({ num: 0, den: 0, pct: null, label: '0/0 (—)' })
    })

    it('표가 없으면(42P01) 모든 집계가 null. 빈 표(0건)와 다르다', () => {
        expect(isTableMissing({ code: '42P01' })).toBe(true)
        expect(isTableMissing({ code: '23505' })).toBe(false)
        expect(isTableMissing(null)).toBe(false)
        expect(teamStats(null)).toBeNull()
        expect(approvalStats(null, '2026-09-22T15:00:00.000Z')).toBeNull()
        expect(checkinStats(null)).toBeNull()
        expect(nextStepStats(null, '2026-09-23')).toBeNull()
        expect(messageStats(null)).toBeNull()
        expect(rateLimitTop(null)).toBeNull()
        // 빈 표는 0
        expect(teamStats([])).toEqual({ teams: 0, bots: 0, roles: {} })
        expect(messageStats([])).toEqual({})
    })

    it('봇 팀 = 사용자 수(distinct)·봇 수·역할 분포', () => {
        const s = teamStats([
            { user_id: 'a', role: 'twin' },
            { user_id: 'a', role: 'chief' },
            { user_id: 'a', role: 'helper' },
            { user_id: 'b', role: 'chief' },
        ])
        expect(s).toEqual({ teams: 2, bots: 4, roles: { twin: 1, chief: 2, helper: 1 } })
    })

    it('승인 카드 = 오늘·7일 상태별 수 + 결정 비율(분모 포함). 모르는 상태(expired)는 안 센다', () => {
        const today = '2026-09-22T15:00:00.000Z'
        const s = approvalStats([
            { status: 'pending', created_at: '2026-09-22T16:00:00.000Z' },
            { status: 'allowed', created_at: '2026-09-22T17:00:00.000Z' },
            { status: 'denied', created_at: '2026-09-20T10:00:00.000Z' },
            { status: 'edited_allowed', created_at: '2026-09-19T10:00:00.000Z' },
            { status: 'expired', created_at: '2026-09-19T10:00:00.000Z' },
        ], today)!
        expect(s.today).toEqual({ pending: 1, allowed: 1, denied: 0, edited_allowed: 0 })
        expect(s.week).toEqual({ pending: 1, allowed: 1, denied: 1, edited_allowed: 1 })
        expect(s.decidedWeek.label).toBe('3/4 (75.0%)')
    })

    it('체크인 = 줄 수·날 수·사람 수', () => {
        const s = checkinStats([
            { day: '2026-09-21', user_id: 'a' },
            { day: '2026-09-21', user_id: 'b' },
            { day: '2026-09-22', user_id: 'a' },
        ])
        expect(s).toEqual({ rows: 3, days: 2, users: 2 })
    })

    it('미룬 일 = 안 끝난 것 중 기한 지난 것. 기한 없는 건 미룬 게 아니다', () => {
        const s = nextStepStats([
            { due_on: '2026-09-20', done_at: null },        // 미룬 일
            { due_on: '2026-09-23', done_at: null },        // 오늘 = 아직 아님
            { due_on: null, done_at: null },                // 기한 없음
            { due_on: '2026-09-01', done_at: '2026-09-02T00:00:00Z' }, // 끝남
        ], '2026-09-23')!
        expect(s.open).toBe(3)
        expect(s.overdue).toBe(1)
        expect(s.overdueRatio.label).toBe('1/3 (33.3%)')
    })

    it('메시지 로그 = 채널별 sent·blocked·failed', () => {
        const s = messageStats([
            { channel: 'push', status: 'sent' },
            { channel: 'push', status: 'blocked' },
            { channel: 'email', status: 'failed' },
            { channel: 'email', status: 'sent' },
            { channel: 'email', status: 'sent' },
        ])
        expect(s).toEqual({
            push: { sent: 1, blocked: 1, failed: 0 },
            email: { sent: 2, blocked: 0, failed: 1 },
        })
    })

    it('요청 제한 = 열쇠별 합산 → 상위 n, 열쇠는 마스킹', () => {
        const top = rateLimitTop([
            { key: 'chat:u:0f1e2d3c-aaaa', count: 5 },
            { key: 'chat:u:0f1e2d3c-aaaa', count: 7 },
            { key: 'image:ip:203.0.113.9', count: 3 },
            { key: 'tts:u:99999999-bbbb', count: 1 },
        ], 2)!
        expect(top).toEqual([
            { key: 'chat:u:0f1e…', count: 12 },
            { key: 'image:ip:203.…', count: 3 },
        ])
        expect(top.some(t => t.key.includes('aaaa'))).toBe(false)
    })

    it('마스킹·자르기 — 사용자 id 앞 8자, 요약 60자, 열쇠 모양이 달라도 4자만', () => {
        expect(shortId('0f1e2d3c-4b5a-6978')).toBe('0f1e2d3c')
        expect(shortId(null)).toBe('—')
        expect(truncate('가'.repeat(70))).toBe('가'.repeat(60) + '…')
        expect(truncate('  짧은   글 ')).toBe('짧은 글')
        expect(maskRateKey('weird-key-without-colons')).toBe('weir…')
    })

    it('드라이버 상태 = 환경변수 있다/없다만. 값은 결과에 안 들어간다', () => {
        const p = envPresence({ UPSTAGE_API_KEY: 'sk-secret-123', LLM_DRIVER: '  ', GEMINI_API_KEY: undefined }, ['UPSTAGE_API_KEY', 'LLM_DRIVER', 'GEMINI_API_KEY'])
        expect(p).toEqual({ UPSTAGE_API_KEY: true, LLM_DRIVER: false, GEMINI_API_KEY: false })
        expect(JSON.stringify(p)).not.toContain('secret')
    })

    it('서울 기준 오늘 0시·오늘 날짜', () => {
        // 2026-09-23 03:44 KST = 2026-09-22 18:44 UTC
        const now = Date.parse('2026-09-22T18:44:00.000Z')
        expect(startOfTodayKst(now)).toBe('2026-09-22T15:00:00.000Z')
        expect(todayKstDate(now)).toBe('2026-09-23')
        // 2026-09-22 23:30 KST 는 아직 22일
        expect(todayKstDate(Date.parse('2026-09-22T14:30:00.000Z'))).toBe('2026-09-22')
    })
})
