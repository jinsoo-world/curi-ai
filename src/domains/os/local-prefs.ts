// domains/os — 브라우저에만 적어 두는 설정 둘: 화면 모드(테마), 추가 사용 월 한도.
//
// 왜 도메인에 두나 = 값 검사, 열쇠 이름, 「시스템 설정 따르기」 계산을 화면마다 다르게 베끼기 쉽다.
// 브라우저(localStorage, matchMedia)는 여기서 직접 만지지 않는다. 화면이 넘겨 준다.
// ⚠️ os/layout.tsx 의 첫 그림 전 인라인 스크립트가 같은 열쇠(THEME_KEY)와 같은 규칙을 손으로 다시 쓴다.
//    여기를 바꾸면 그 스크립트도 같이 바꿔라.

/* ────────────────────────── 화면 모드 ────────────────────────── */

export const THEMES = ['light', 'dark'] as const
export type Theme = typeof THEMES[number]
export type ThemeChoice = 'system' | Theme
export const THEME_CHOICES: readonly ThemeChoice[] = ['system', ...THEMES]

/** 브라우저에 적어 두는 열쇠 */
export const THEME_KEY = 'os-theme'

/** 다크 배경색(뷰포트 themeColor 와 같은 값) / 라이트 배경색 */
export const THEME_BG: Record<Theme, string> = { dark: '#0B0B0C', light: '#FFFFFF' }

export function cleanThemeChoice(v: unknown): ThemeChoice {
    return (THEME_CHOICES as readonly string[]).includes(String(v)) ? (v as ThemeChoice) : 'system'
}

/** 선택지 + 「기기가 다크인가」 → 실제로 그릴 모드 */
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
    if (choice === 'system') return systemDark ? 'dark' : 'light'
    return choice
}

export function readThemeChoice(store?: Pick<Storage, 'getItem'> | null): ThemeChoice {
    try { return cleanThemeChoice(store?.getItem(THEME_KEY)) } catch { return 'system' }
}

/** 「시스템」이면 열쇠를 지운다(기본값은 남기지 않는다) */
export function saveThemeChoice(choice: unknown, store?: Pick<Storage, 'setItem' | 'removeItem'> | null): ThemeChoice {
    const 값 = cleanThemeChoice(choice)
    try {
        if (값 === 'system') store?.removeItem(THEME_KEY)
        else store?.setItem(THEME_KEY, 값)
    } catch { /* 저장이 막혀도 이번 화면에는 적용된다 */ }
    return 값
}

/** 요소 중 우리가 만지는 부분만. 시험에서는 가짜 객체를 넘긴다 */
export type ThemeRoot = { dataset: Record<string, string | undefined> }

/** 감싸는 칸(os/layout.tsx 의 data-os-root)에 data-theme="light|dark" 를 붙인다 → theme.css 의 `[data-theme="light"] …` 가 받는다 */
export function applyTheme(root: ThemeRoot | null | undefined, theme: Theme): Theme {
    if (root) root.dataset.theme = theme
    return theme
}

/* ────────────────────────── 추가 사용 월 한도 ────────────────────────── */

export const EXTRA_MODES = ['none', 'fixed', 'unlimited'] as const
export type ExtraMode = typeof EXTRA_MODES[number]
export interface ExtraUsage {
    mode: ExtraMode
    /** 「정해둔 만큼」일 때 한 달 최대 금액(원). 다른 모드면 0 */
    amount: number
}

export const EXTRA_KEY = 'os-extra-usage'
export const EXTRA_DEFAULT: ExtraUsage = { mode: 'none', amount: 0 }
/** 금액 칸 한도. 너무 큰 수는 실수라 잘라 낸다 */
export const EXTRA_MAX_AMOUNT = 10_000_000

/** 무엇이 들어와도 우리가 아는 모양으로. 금액은 0 이상 정수, fixed 가 아니면 0 */
export function cleanExtraUsage(v: unknown): ExtraUsage {
    if (!v || typeof v !== 'object') return { ...EXTRA_DEFAULT }
    const o = v as Record<string, unknown>
    const mode = (EXTRA_MODES as readonly string[]).includes(String(o.mode)) ? (o.mode as ExtraMode) : 'none'
    const n = Math.floor(Number(o.amount))
    const amount = mode === 'fixed' && Number.isFinite(n) && n > 0 ? Math.min(n, EXTRA_MAX_AMOUNT) : 0
    return { mode, amount }
}

export function readExtraUsage(store?: Pick<Storage, 'getItem'> | null): ExtraUsage {
    try {
        const raw = store?.getItem(EXTRA_KEY)
        return raw ? cleanExtraUsage(JSON.parse(raw)) : { ...EXTRA_DEFAULT }
    } catch { return { ...EXTRA_DEFAULT } }
}

export function saveExtraUsage(v: unknown, store?: Pick<Storage, 'setItem'> | null): ExtraUsage {
    const 값 = cleanExtraUsage(v)
    try { store?.setItem(EXTRA_KEY, JSON.stringify(값)) } catch { /* 저장이 막혀도 이번 화면에는 적용된다 */ }
    return 값
}
