import { describe, it, expect } from 'vitest'
import {
    DICT, LOCALES, LOCALE_KEY,
    cleanLocaleChoice, dayHourTextL, localeFromSystem, planNameL, readLocaleChoice, resolveLocale, saveLocaleChoice, t, untilTextL, usageDetailL,
} from '../i18n'

function 창고(초기: Record<string, string> = {}) {
    const 속 = { ...초기 }
    return {
        속,
        getItem: (k: string) => (k in 속 ? 속[k] : null),
        setItem: (k: string, v: string) => { 속[k] = v },
        removeItem: (k: string) => { delete 속[k] },
    }
}

describe('사전', () => {
    it('세 언어의 키 집합이 똑같다', () => {
        const 기준 = Object.keys(DICT.ko).sort()
        for (const l of LOCALES) {
            expect(Object.keys(DICT[l]).sort(), `${l} 키 집합`).toEqual(기준)
        }
    })

    it('빈 값이 없다', () => {
        for (const l of LOCALES) {
            for (const [k, v] of Object.entries(DICT[l])) expect(v.trim(), `${l}.${k}`).not.toBe('')
        }
    })

    it('화면 글자에 중간점과 줄표를 쓰지 않는다', () => {
        for (const l of LOCALES) {
            for (const [k, v] of Object.entries(DICT[l])) {
                expect(v, `${l}.${k}`).not.toMatch(/[·—]/)
            }
        }
    })

    it('구멍({n})을 채운다. 안 준 구멍은 그대로 남긴다', () => {
        expect(t('ko', 'review.count', { n: 3 })).toBe('내 봇 3개에 같이 적용돼요.')
        expect(t('en', 'usage.weekLine', { pct: 3 })).toBe('Monthly usage 3%')
        expect(t('ja', 'noti.sms.to')).toBe('{phone} に送ります')
    })
})

describe('언어 고르기', () => {
    it('우리가 아는 값만 통과시킨다', () => {
        expect(cleanLocaleChoice('ja')).toBe('ja')
        expect(cleanLocaleChoice('system')).toBe('system')
        expect(cleanLocaleChoice('fr')).toBe('system')
        expect(cleanLocaleChoice(null)).toBe('system')
    })

    it('브라우저 언어 → 세 언어 중 하나. 모르면 한국어', () => {
        expect(localeFromSystem('ja-JP')).toBe('ja')
        expect(localeFromSystem('en-US')).toBe('en')
        expect(localeFromSystem('ko')).toBe('ko')
        expect(localeFromSystem('fr-FR')).toBe('ko')
        expect(localeFromSystem(undefined)).toBe('ko')
    })

    it('시스템이면 브라우저 언어, 아니면 고른 것', () => {
        expect(resolveLocale('system', 'en-GB')).toBe('en')
        expect(resolveLocale('ja', 'en-GB')).toBe('ja')
    })

    it('저장하고 읽는다. 시스템은 열쇠를 지운다', () => {
        const s = 창고()
        expect(saveLocaleChoice('en', s)).toBe('en')
        expect(s.속[LOCALE_KEY]).toBe('en')
        expect(readLocaleChoice(s)).toBe('en')
        saveLocaleChoice('system', s)
        expect(LOCALE_KEY in s.속).toBe(false)
        expect(readLocaleChoice(s)).toBe('system')
    })

    it('저장이 막혀도 죽지 않는다', () => {
        const 막힘 = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }
        expect(readLocaleChoice(막힘)).toBe('system')
        expect(saveLocaleChoice('ja', 막힘)).toBe('ja')
    })
})

describe('사용량 글자 (언어별)', () => {
    const now = new Date('2026-09-23T03:00:00Z')   // 서울 12시 (수)
    const view = {
        plan: 'basic', used: 37, limit: 370, pct: 10, remaining: 333,
        resetAt: new Date('2026-09-30T15:00:00Z'),   // 서울 10월 1일 0시
        blocked: false,
    }

    it('남은 시간', () => {
        const at = new Date(now.getTime() + 95 * 60_000)
        expect(untilTextL('en', at, now)).toBe('in 1 h 35 min')
        expect(untilTextL('ja', at, now)).toBe('1時間35分後')
        expect(untilTextL('ko', at, now)).toBe('1시간 35분 후')
        expect(untilTextL('en', new Date(now.getTime() + 1000), now)).toBe('soon')
    })

    it('요일과 시각', () => {
        const mon = new Date('2026-09-27T15:00:00Z')
        expect(dayHourTextL('ko', mon)).toBe('(월) 0시')
        expect(dayHourTextL('en', mon)).toBe('Mon 0:00')
        expect(dayHourTextL('ja', mon)).toBe('(月) 0時')
    })

    it('남은 횟수, 퍼센트, 초기화 날', () => {
        expect(usageDetailL('ko', view, now).remainingText).toBe('이번 달 남은 333번')
        expect(usageDetailL('en', view, now).remainingText).toBe('333 left this month')
        expect(usageDetailL('ja', view, now).remainingText).toBe('今月の残り333回')
        expect(usageDetailL('en', view, now).pctText).toBe('10%')
        expect(usageDetailL('en', view, now).resetText).toBe('Resets 10/1 0:00 (Korea time)')
        expect(usageDetailL('ja', view, now).resetText).toBe('10月1日0時にリセット')
        expect(usageDetailL('en', view, now).blockedText).toBeNull()
        expect(usageDetailL('en', { ...view, blocked: true }, now).blockedText).toContain('10/1')
    })

    it('요금제 이름은 실제 요금제를 따른다 (무료 고정 버그)', () => {
        expect(planNameL('ko', 'basic')).toBe('베이직')
        expect(planNameL('ko', 'pro')).toBe('프로')
        expect(planNameL('ko', 'free')).toBe('무료(기본)')
        expect(planNameL('ko', undefined)).toBe('무료(기본)')
        expect(planNameL('en', 'pro')).toBe('Pro')
    })
})
