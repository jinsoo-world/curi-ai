import { describe, it, expect } from 'vitest'
import {
    EXTRA_KEY, EXTRA_MAX_AMOUNT, THEME_KEY,
    applyTheme, cleanExtraUsage, cleanThemeChoice, readExtraUsage, readThemeChoice, resolveTheme, saveExtraUsage, saveThemeChoice,
} from '../local-prefs'

function 창고(초기: Record<string, string> = {}) {
    const 속 = { ...초기 }
    return {
        속,
        getItem: (k: string) => (k in 속 ? 속[k] : null),
        setItem: (k: string, v: string) => { 속[k] = v },
        removeItem: (k: string) => { delete 속[k] },
    }
}

describe('화면 모드', () => {
    it('우리가 아는 값만 통과시킨다', () => {
        expect(cleanThemeChoice('light')).toBe('light')
        expect(cleanThemeChoice('dark')).toBe('dark')
        expect(cleanThemeChoice('blue')).toBe('system')
        expect(cleanThemeChoice(null)).toBe('system')
    })

    it('시스템이면 기기 설정을, 아니면 고른 것을 따른다', () => {
        expect(resolveTheme('system', true)).toBe('dark')
        expect(resolveTheme('system', false)).toBe('light')
        expect(resolveTheme('light', true)).toBe('light')
        expect(resolveTheme('dark', false)).toBe('dark')
    })

    it('저장하고 읽는다. 시스템은 열쇠를 지운다', () => {
        const s = 창고()
        saveThemeChoice('light', s)
        expect(s.속[THEME_KEY]).toBe('light')
        expect(readThemeChoice(s)).toBe('light')
        saveThemeChoice('system', s)
        expect(THEME_KEY in s.속).toBe(false)
        expect(readThemeChoice(s)).toBe('system')
    })

    it('html 에 data-theme 를 붙인다', () => {
        const root = { dataset: {} as Record<string, string | undefined> }
        applyTheme(root, 'light')
        expect(root.dataset.theme).toBe('light')
        applyTheme(root, 'dark')
        expect(root.dataset.theme).toBe('dark')
        expect(applyTheme(null, 'dark')).toBe('dark')
    })
})

describe('추가 사용 월 한도', () => {
    it('모르는 값은 기본(안 씀)으로', () => {
        expect(cleanExtraUsage(null)).toEqual({ mode: 'none', amount: 0 })
        expect(cleanExtraUsage({ mode: 'gold', amount: 5 })).toEqual({ mode: 'none', amount: 0 })
    })

    it('정해둔 만큼일 때만 금액을 남기고, 정수로 자른다', () => {
        expect(cleanExtraUsage({ mode: 'fixed', amount: '30000.7' })).toEqual({ mode: 'fixed', amount: 30000 })
        expect(cleanExtraUsage({ mode: 'fixed', amount: -5 })).toEqual({ mode: 'fixed', amount: 0 })
        expect(cleanExtraUsage({ mode: 'fixed', amount: 99_999_999_999 })).toEqual({ mode: 'fixed', amount: EXTRA_MAX_AMOUNT })
        expect(cleanExtraUsage({ mode: 'unlimited', amount: 30000 })).toEqual({ mode: 'unlimited', amount: 0 })
    })

    it('저장하고 읽는다. 깨진 저장값은 기본으로', () => {
        const s = 창고()
        saveExtraUsage({ mode: 'fixed', amount: 20000 }, s)
        expect(JSON.parse(s.속[EXTRA_KEY])).toEqual({ mode: 'fixed', amount: 20000 })
        expect(readExtraUsage(s)).toEqual({ mode: 'fixed', amount: 20000 })
        expect(readExtraUsage(창고({ [EXTRA_KEY]: '{깨진' }))).toEqual({ mode: 'none', amount: 0 })
        expect(readExtraUsage(창고())).toEqual({ mode: 'none', amount: 0 })
    })
})
