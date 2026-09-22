import { describe, it, expect } from 'vitest'
import { weekStartSeoul, summarizeWeek, EMPTY_WEEK } from '../weekly'

/** 한국 2026-09-25(금) 아침 */
const 금요일 = new Date('2026-09-24T23:30:00Z')

describe('os/weekly — 이번 주가 언제부터인가', () => {
    it('월요일 0시(한국)부터 센다', () => {
        // 한국 2026-09-25 금 → 이번 주 시작은 2026-09-21 월
        expect(weekStartSeoul(금요일)).toBe('2026-09-21')
    })

    it('일요일은 그 주의 끝이지 다음 주 시작이 아니다', () => {
        // 한국 2026-09-27 일 → 여전히 09-21 주
        expect(weekStartSeoul(new Date('2026-09-26T23:00:00Z'))).toBe('2026-09-21')
    })

    it('월요일 당일은 그날이 시작', () => {
        expect(weekStartSeoul(new Date('2026-09-27T23:00:00Z'))).toBe('2026-09-28')
    })
})

describe('os/weekly — 이번 주 카드 숫자', () => {
    it('아무것도 없으면 전부 0', () => {
        expect(summarizeWeek({ nextSteps: [], approvals: [], checkinDays: [], knowledgeCount: 0 }, '2026-09-25'))
            .toEqual(EMPTY_WEEK)
    })

    it('안 끝난 미룬 일만 세고, 끝낸 것은 빼고, 가장 오래된 것의 며칠째를 준다', () => {
        const r = summarizeWeek({
            nextSteps: [
                { due_on: '2026-09-22', done_at: null, created_at: '2026-09-20T00:00:00Z' },   // 3일째
                { due_on: '2026-09-18', done_at: null, created_at: '2026-09-18T00:00:00Z' },   // 7일째
                { due_on: '2026-09-18', done_at: '2026-09-24T00:00:00Z', created_at: '2026-09-18T00:00:00Z' }, // 끝냄
                { due_on: null, done_at: null, created_at: '2026-09-24T00:00:00Z' },           // 기한 없음 = 만든 날 기준 1일째
            ],
            approvals: [{ status: 'allowed' }, { status: 'denied' }, { status: 'pending' }],
            checkinDays: ['2026-09-22', '2026-09-23', '2026-09-23'],
            knowledgeCount: 4,
        }, '2026-09-25')

        expect(r.openNextSteps).toBe(3)
        expect(r.oldestDays).toBe(7)
        expect(r.approvalsDecided).toBe(2)     // pending 은 「처리」가 아니다
        expect(r.checkinDays).toBe(2)          // 같은 날 두 줄은 하루로 센다
        expect(r.knowledgeRead).toBe(4)
    })

    it('기한이 아직 안 지난 일은 0일째로 센다 (미래를 음수로 세지 않는다)', () => {
        const r = summarizeWeek({
            nextSteps: [{ due_on: '2026-09-30', done_at: null, created_at: '2026-09-25T00:00:00Z' }],
            approvals: [], checkinDays: [], knowledgeCount: 0,
        }, '2026-09-25')
        expect(r.openNextSteps).toBe(1)
        expect(r.oldestDays).toBe(0)
    })
})
