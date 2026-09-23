'use client'
// 언어(한국어, 영어, 일본어) 문맥. os/layout.tsx 가 OsShell 을 이걸로 감싼다.
//   const { t, locale, choice, setChoice } = useLocale()
//   t('settings.title')  → 지금 언어의 글자
// 선택은 브라우저 localStorage `os-locale` 에 남고, 「시스템」이면 navigator.language 를 따른다.
// 서버에서는 늘 한국어로 그리고, 브라우저에서 첫 그림 뒤 한 박자에 저장된 언어로 바꾼다(hydration 어긋남 방지).
// 화면 모드(테마)의 「시스템 설정 따르기」가 기기 설정 변화를 따라가는 감시도 여기서 한 번만 건다.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
    HTML_LANG, readLocaleChoice, resolveLocale, saveLocaleChoice, t as translate,
    type Locale, type LocaleChoice, type TKey,
} from '@/domains/os/i18n'
import { THEME_BG, applyTheme, readThemeChoice, resolveTheme } from '@/domains/os/local-prefs'

interface LocaleState {
    /** 실제로 그리는 언어 */
    locale: Locale
    /** 사람이 고른 것(시스템 포함) */
    choice: LocaleChoice
    setChoice: (c: LocaleChoice) => void
    t: (key: TKey, vars?: Record<string, string | number>) => string
}

const Ctx = createContext<LocaleState | null>(null)

/** 문맥 밖(시험, 낱개 화면)에서 불려도 죽지 않게 한국어로 답한다 */
const FALLBACK: LocaleState = {
    locale: 'ko', choice: 'system', setChoice: () => { },
    t: (key, vars) => translate('ko', key, vars),
}

export function useLocale(): LocaleState {
    return useContext(Ctx) ?? FALLBACK
}

function systemLang(): string | undefined {
    return typeof navigator === 'undefined' ? undefined : navigator.language
}

/** 지금 화면 모드를 감싸는 칸(os/layout.tsx 의 data-os-root)과 상태바 색(meta theme-color)에 붙인다 */
export function paintTheme() {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const root = document.querySelector<HTMLElement>('[data-os-root]')
    const theme = applyTheme(root, resolveTheme(readThemeChoice(window.localStorage), dark))
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(m => { m.content = THEME_BG[theme] })
}

export default function LocaleProvider({ children }: { children: React.ReactNode }) {
    const [choice, setChoiceState] = useState<LocaleChoice>('system')
    const [locale, setLocale] = useState<Locale>('ko')

    // 저장해 둔 언어를 되살린다. 효과 본문에서 바로 setState 하지 않는다(린트 규칙)
    useEffect(() => {
        void Promise.resolve().then(() => {
            const c = readLocaleChoice(window.localStorage)
            setChoiceState(c)
            setLocale(resolveLocale(c, systemLang()))
        })
    }, [])

    // html lang 은 그리는 언어를 따라간다
    useEffect(() => { document.documentElement.lang = HTML_LANG[locale] }, [locale])

    // 화면 모드: 기기 설정이 바뀌면(「시스템 설정 따르기」일 때) 따라간다
    useEffect(() => {
        paintTheme()
        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        mq.addEventListener('change', paintTheme)
        return () => mq.removeEventListener('change', paintTheme)
    }, [])

    const setChoice = useCallback((c: LocaleChoice) => {
        const saved = saveLocaleChoice(c, window.localStorage)
        setChoiceState(saved)
        setLocale(resolveLocale(saved, systemLang()))
    }, [])

    const value = useMemo<LocaleState>(() => ({
        locale, choice, setChoice,
        t: (key, vars) => translate(locale, key, vars),
    }), [locale, choice, setChoice])

    return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
