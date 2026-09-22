import { describe, it, expect } from 'vitest'
import {
    seoulClock, parseLocalTime, formatLocalTime, describeSchedule,
    isInWindow, alreadyRanInSlot, shouldRunNow, buildRoutinePrompt,
} from '../schedule'

/** 2026-09-25 는 금요일. 한국 08:30 = UTC 전날 23:30 */
const 금요_0830_한국 = new Date('2026-09-24T23:30:00Z')

describe('os/schedule — 한국 시각 읽기', () => {
    it('UTC 를 한국 달력으로 바꾼다 (날짜가 하루 넘어간다)', () => {
        const c = seoulClock(금요_0830_한국)
        expect(c).toMatchObject({ year: 2026, month: 9, day: 25, hour: 8, minute: 30, weekday: 5 })
    })

    it('한국 자정 직전·직후를 제대로 가른다', () => {
        expect(seoulClock(new Date('2026-09-25T14:59:00Z')).day).toBe(25)   // 한국 23:59
        expect(seoulClock(new Date('2026-09-25T15:00:00Z')).day).toBe(26)   // 한국 00:00
    })

    it('시각 글자를 분으로, 분을 글자로 바꾼다', () => {
        expect(parseLocalTime('08:30:00')).toBe(510)
        expect(parseLocalTime('08:30')).toBe(510)
        expect(parseLocalTime('엉터리')).toBeNull()
        expect(formatLocalTime('08:30:00')).toBe('오전 8:30')
        expect(formatLocalTime('20:05:00')).toBe('오후 8:05')
        expect(formatLocalTime('00:00:00')).toBe('오전 0:00')
    })
})

describe('os/schedule — 5분 창 계산', () => {
    it('예정 시각부터 5분 동안만 연다 (앞당겨 돌지 않는다)', () => {
        expect(isInWindow(510, 510, 5)).toBe(true)
        expect(isInWindow(510, 514, 5)).toBe(true)
        expect(isInWindow(510, 515, 5)).toBe(false)
        expect(isInWindow(510, 509, 5)).toBe(false)
    })

    it('자정을 넘겨도 음수로 새지 않는다', () => {
        // 23:58 예정, 지금 00:01 → 지났으니 안 돈다(다음 날 창에서 다시 본다)
        expect(isInWindow(23 * 60 + 58, 1, 5)).toBe(false)
    })
})

describe('os/schedule — 지금 돌 루틴인가', () => {
    const 매일 = { schedule_kind: 'daily' as const, run_at_local: '08:30:00', weekday: null, timezone: 'Asia/Seoul' }

    it('매일: 창 안이면 돈다', () => {
        expect(shouldRunNow(매일, 금요_0830_한국)).toBe(true)
        expect(shouldRunNow(매일, new Date('2026-09-24T23:36:00Z'))).toBe(false)
    })

    it('평일: 토·일은 건너뛴다', () => {
        const 평일 = { ...매일, schedule_kind: 'weekdays' as const }
        expect(shouldRunNow(평일, 금요_0830_한국)).toBe(true)                        // 금요일
        expect(shouldRunNow(평일, new Date('2026-09-25T23:30:00Z'))).toBe(false)     // 한국 토요일 08:30
        expect(shouldRunNow(평일, new Date('2026-09-26T23:30:00Z'))).toBe(false)     // 한국 일요일 08:30
        expect(shouldRunNow(평일, new Date('2026-09-27T23:30:00Z'))).toBe(true)      // 한국 월요일 08:30
    })

    it('주 1회: 정한 요일에만 돈다', () => {
        const 금요일만 = { ...매일, schedule_kind: 'weekly' as const, weekday: 5 }
        expect(shouldRunNow(금요일만, 금요_0830_한국)).toBe(true)
        expect(shouldRunNow({ ...금요일만, weekday: 1 }, 금요_0830_한국)).toBe(false)
        // 요일을 안 정한 주 1회는 돌지 않는다 (넓은 트리거 금지)
        expect(shouldRunNow({ ...금요일만, weekday: null }, 금요_0830_한국)).toBe(false)
    })

    it('시각이 깨졌으면 돌지 않는다', () => {
        expect(shouldRunNow({ ...매일, run_at_local: '' }, 금요_0830_한국)).toBe(false)
    })
})

describe('os/schedule — 같은 슬롯 두 번 돌기 막기', () => {
    it('같은 날 같은 시간대에 이미 돌았으면 건너뛴다', () => {
        // 08:30 에 돌았고 지금은 08:33 (크론이 5분마다라 또 걸린다)
        const 아까 = new Date('2026-09-24T23:30:10Z').toISOString()
        expect(alreadyRanInSlot(아까, new Date('2026-09-24T23:33:00Z'), '08:30:00', 'Asia/Seoul')).toBe(true)
    })

    it('하루 지났으면 다시 돈다', () => {
        const 어제 = new Date('2026-09-23T23:30:10Z').toISOString()
        expect(alreadyRanInSlot(어제, 금요_0830_한국, '08:30:00', 'Asia/Seoul')).toBe(false)
    })

    it('한 번도 안 돌았으면 당연히 돈다', () => {
        expect(alreadyRanInSlot(null, 금요_0830_한국, '08:30:00', 'Asia/Seoul')).toBe(false)
    })
})

describe('os/schedule — 사람이 읽는 주기 설명', () => {
    it('매일·평일·주 1회를 한국말로 적는다', () => {
        expect(describeSchedule({ schedule_kind: 'daily', run_at_local: '08:30:00', weekday: null })).toBe('매일 오전 8:30')
        expect(describeSchedule({ schedule_kind: 'weekdays', run_at_local: '20:00:00', weekday: null })).toBe('평일 오후 8:00')
        expect(describeSchedule({ schedule_kind: 'weekly', run_at_local: '09:05:00', weekday: 1 })).toBe('매주 월요일 오전 9:05')
        expect(describeSchedule({ schedule_kind: 'weekly', run_at_local: '09:05:00', weekday: null })).toBe('요일을 아직 안 골랐어요')
    })
})

describe('os/schedule — 루틴 지시문 조립', () => {
    const 기본 = {
        title: '아침 팬 질문 모아 초안',
        instruction: '어제 받은 질문을 모아 답장 초안을 만들어 줘',
        input_source: '팬 질문 메모',
        expected_output: '질문 1개당 초안 1개',
        on_missing_data: 'report_failure' as const,
        approval_boundary: '밖으로 보내는 일은 항상 승인받는다',
    }

    it('시킨 말·입력 출처·기대 결과·승인 경계가 모두 들어간다', () => {
        const p = buildRoutinePrompt(기본)
        expect(p).toContain('어제 받은 질문을 모아 답장 초안을 만들어 줘')
        expect(p).toContain('팬 질문 메모')
        expect(p).toContain('질문 1개당 초안 1개')
        expect(p).toContain('밖으로 보내는 일은 항상 승인받는다')
    })

    it('자료가 없을 때 기본값은 「지어내지 말고 실패 보고」', () => {
        const p = buildRoutinePrompt(기본)
        expect(p).toContain('지어내지')
        expect(p).toContain('자료가 없어서 못 했어요')
    })

    it('「조용히 건너뛰기」를 고르면 문구가 바뀐다', () => {
        const p = buildRoutinePrompt({ ...기본, on_missing_data: 'skip' })
        expect(p).toContain('건너뜁니다')
        expect(p).not.toContain('자료가 없어서 못 했어요')
    })

    it('밖으로 직접 보내지 않는다는 못이 항상 박힌다', () => {
        const p = buildRoutinePrompt({ ...기본, approval_boundary: '' })
        expect(p).toContain('직접 하지 않는다')
    })
})
