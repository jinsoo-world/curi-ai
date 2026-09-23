'use client'
// 설정 화면 (/os/settings) = 그록봇 설정창 구조. 왼쪽 탭(폰에서는 위 가로 칩) + 오른쪽 내용.
// 탭 = 일반 / 알림 / 사용량과 요금제 / 앱. 「연결」은 /os/connect 로 갔다(여기엔 링크 한 줄만).
// 손님 = 4060 강사, 작가. 글자는 크게, 단추는 44px 이상, 색은 [data-theme="os"] 토큰만. 글자는 전부 사전(i18n)에서.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCreditBalance } from '@/domains/credit'
import { FONT_SIZES, OS_TIMEZONE, applyFontSize, readFontSize, saveFontSize, type FontSize } from '@/domains/os/settings'
import { LOCALE_CHOICES, usageDetailL, type LocaleChoice, type TKey } from '@/domains/os/i18n'
import {
    EXTRA_MODES, THEME_CHOICES, readExtraUsage, readThemeChoice, saveExtraUsage, saveThemeChoice,
    type ExtraMode, type ExtraUsage, type ThemeChoice,
} from '@/domains/os/local-prefs'
import { usageTone, withComma, type UsageLike } from '@/domains/os/usage'
import { isLowClover } from '@/domains/credit/charge-flow'
import { useLocale, paintTheme } from '@/components/os/LocaleProvider'
import NotificationSettings, { Toggle } from '@/components/os/NotificationSettings'
import { RingSvg } from '@/components/os/UsageRing'
import InstallPrompt from '@/components/pwa/InstallPrompt'
import type { ApprovalMode, TeamBot } from '@/domains/os/types'
import '@/components/os/settings.css'
import '@/components/os/usage.css'

type Tab = 'general' | 'alerts' | 'usage' | 'app'
const TABS: { id: Tab; key: TKey }[] = [
    { id: 'general', key: 'tab.general' },
    { id: 'alerts', key: 'tab.alerts' },
    { id: 'usage', key: 'tab.usage' },
    { id: 'app', key: 'tab.app' },
]
const APPROVALS: ApprovalMode[] = ['always_ask', 'draft_only', 'auto_safe']
const THEME_KEYS: Record<ThemeChoice, TKey> = { system: 'theme.system', light: 'theme.light', dark: 'theme.dark' }
const LOCALE_KEYS: Record<LocaleChoice, TKey> = { system: 'lang.system', ko: 'lang.ko', en: 'lang.en', ja: 'lang.ja' }
const FONT_KEYS: Record<FontSize, TKey> = { small: 'font.small', normal: 'font.normal', large: 'font.large' }
const EXTRA_KEYS: Record<ExtraMode, TKey> = { none: 'extra.none', fixed: 'extra.fixed', unlimited: 'extra.unlimited' }

/** 설정 저장 창구(/api/os/prefs)가 있으면 거기에도 적는다. 없으면(404) 한 번만 확인하고 그 뒤로는 안 부른다 */
let prefsApi: boolean | null = null
async function savePrefsRemote(extraUsage: ExtraUsage) {
    if (prefsApi === false) return
    try {
        const r = await fetch('/api/os/prefs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extraUsage }) })
        if (r.status === 404 || r.status === 405) prefsApi = false
        else prefsApi = r.ok
    } catch { /* 저장 창구가 없어도 localStorage 에는 이미 적혔다 */ }
}

const CHIP_STYLE = { minHeight: 44, padding: '10px 16px' } as const

export default function SettingsScreen({ version }: { version: string }) {
    const { t, choice: localeChoice, setChoice: setLocaleChoice } = useLocale()
    const [tab, setTab] = useState<Tab>('general')

    // 주소 뒤 #usage 같은 표시로 들어오면 그 탭을 편다. 효과 본문에서 바로 setState 하지 않는다(린트 규칙)
    useEffect(() => {
        void Promise.resolve().then(() => {
            const h = window.location.hash.replace('#', '') as Tab
            if (TABS.some(x => x.id === h)) setTab(h)
        })
    }, [])
    const goTab = (id: Tab) => { setTab(id); try { window.history.replaceState(null, '', `#${id}`) } catch { /* 무시 */ } }

    return (
        <div className="os-settings os-settings-tabs">
            <h1>{t('settings.title')}</h1>
            <div className="os-set-layout">
                <nav className="os-set-tabs" role="tablist" aria-label={t('settings.title')}>
                    {TABS.map(x => (
                        <button key={x.id} type="button" role="tab" id={`os-tab-${x.id}`} aria-selected={tab === x.id} aria-controls={`os-panel-${x.id}`}
                            className="os-set-tab" onClick={() => goTab(x.id)}>{t(x.key)}</button>
                    ))}
                </nav>
                <section className="os-set-panel" role="tabpanel" id={`os-panel-${tab}`} aria-labelledby={`os-tab-${tab}`}>
                    {tab === 'general' && <GeneralTab localeChoice={localeChoice} setLocaleChoice={setLocaleChoice} />}
                    {tab === 'alerts' && <NotificationSettings />}
                    {tab === 'usage' && <UsageTab />}
                    {tab === 'app' && <AppTab version={version} />}
                </section>
            </div>
        </div>
    )
}

/* ────────────────────────── 일반 ────────────────────────── */

function GeneralTab({ localeChoice, setLocaleChoice }: { localeChoice: LocaleChoice; setLocaleChoice: (c: LocaleChoice) => void }) {
    const { t } = useLocale()
    const router = useRouter()
    const [font, setFont] = useState<FontSize>('normal')
    const [theme, setTheme] = useState<ThemeChoice>('system')
    const [user, setUser] = useState<{ name: string; email: string } | null>(null)
    const [checked, setChecked] = useState(false)
    /** 내 봇 명단(승인 모드를 봇마다 저장하므로 필요). null = 아직 못 읽음 */
    const [team, setTeam] = useState<TeamBot[] | null>(null)
    const [approvalNote, setApprovalNote] = useState<string | null>(null)
    const [moreOpen, setMoreOpen] = useState(false)

    const loadTeam = useCallback(async () => {
        try {
            const r = await fetch('/api/os/team', { cache: 'no-store' })
            const d = await r.json().catch(() => ({}))
            setTeam(Array.isArray(d?.team) ? d.team as TeamBot[] : [])
        } catch { setTeam([]) }
    }, [])
    useEffect(() => { void Promise.resolve().then(loadTeam) }, [loadTeam])

    // 저장해 둔 글자 크기, 화면 모드를 되살린다 (한 박자 뒤에)
    useEffect(() => {
        void Promise.resolve().then(() => {
            const 값 = readFontSize(window.localStorage)
            applyFontSize(document.documentElement, 값)
            setFont(값)
            setTheme(readThemeChoice(window.localStorage))
        })
    }, [])

    useEffect(() => {
        let alive = true
        createClient().auth.getUser().then(({ data }) => {
            if (!alive) return
            setChecked(true)
            if (!data.user) return
            const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>
            const name = String(meta.name ?? meta.full_name ?? meta.nickname ?? '')
            setUser({ name, email: data.user.email ?? '' })
        }).catch(() => { if (alive) setChecked(true) })
        return () => { alive = false }
    }, [])

    const 글자바꾸기 = (v: FontSize) => {
        const 값 = saveFontSize(v, window.localStorage)
        applyFontSize(document.documentElement, 값)
        setFont(값)
    }
    const 모드바꾸기 = (v: ThemeChoice) => {
        setTheme(saveThemeChoice(v, window.localStorage))
        paintTheme()
    }

    /** 승인 모드: 누르면 화면이 먼저 바뀌고, 봇마다 저장은 뒤에서. 하나라도 실패하면 되돌린다 */
    const 승인모드바꾸기 = async (mode: ApprovalMode) => {
        if (!team || team.length === 0) return
        const 이전 = team
        setApprovalNote(null)
        setTeam(team.map(b => ({ ...b, approvalMode: mode })))
        const 결과 = await Promise.all(이전.map(b =>
            fetch(`/api/os/team/${b.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvalMode: mode }) })
                .then(r => r.ok).catch(() => false),
        ))
        if (결과.some(ok => !ok)) { setTeam(이전); setApprovalNote(t('review.saveFail')) }
    }

    /** 봇들의 승인 모드가 전부 같으면 그 값, 다르면 null(아무것도 안 고른 채로 보인다) */
    const 현재승인모드: ApprovalMode | null = team && team.length > 0 && team.every(b => b.approvalMode === team[0].approvalMode)
        ? team[0].approvalMode : null
    const guest = checked && !user
    const 승인못고르는이유 = guest ? t('review.guest')
        : team && team.length === 0 ? t('review.noBot')
        : null
    const 자동검토켬 = 현재승인모드 === 'always_ask'

    const 로그아웃 = async () => {
        if (!confirm(t('account.logoutConfirm'))) return
        await createClient().auth.signOut()
        router.push('/')
        router.refresh()
    }

    return (
        <>
            <h2>{t('sec.account')}</h2>
            <div className="os-card">
                {!checked && <div className="os-set-sub">{t('account.loading')}</div>}
                {checked && user && (
                    <>
                        <div className="os-set-line">
                            <div className="os-set-text"><b>{t('account.name')}</b></div>
                            <span className="os-set-value">{user.name || t('account.noName')}</span>
                        </div>
                        <div className="os-set-line">
                            <div className="os-set-text"><b>{t('account.email')}</b></div>
                            <span className="os-set-value">{user.email}</span>
                        </div>
                        <div className="os-set-actions">
                            <Link href="/profile" className="os-btn" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>{t('account.manage')}</Link>
                            <button type="button" className="os-btn" onClick={() => void 로그아웃()}>{t('account.logout')}</button>
                        </div>
                    </>
                )}
                {guest && (
                    <div className="os-set-line">
                        <div className="os-set-text os-set-sub">{t('account.guest')}</div>
                        <Link href="/login?next=/os/settings" className="os-btn primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>{t('account.login')}</Link>
                    </div>
                )}
            </div>

            <h2>{t('sec.appearance')}</h2>
            <div className="os-card">
                <div className="os-set-row">
                    <div><b>{t('theme.label')}</b><div className="os-set-sub">{t('theme.sub')}</div></div>
                </div>
                <div className="os-chips" style={{ marginTop: 10 }}>
                    {THEME_CHOICES.map(c => (
                        <button key={c} type="button" className="os-chipbtn" aria-pressed={theme === c} style={CHIP_STYLE} onClick={() => 모드바꾸기(c)}>{t(THEME_KEYS[c])}</button>
                    ))}
                </div>
                <div className="os-set-row" style={{ marginTop: 16 }}>
                    <div><b>{t('lang.label')}</b><div className="os-set-sub">{t('lang.sub')}</div></div>
                </div>
                <div className="os-chips" style={{ marginTop: 10 }}>
                    {LOCALE_CHOICES.map(c => (
                        <button key={c} type="button" className="os-chipbtn" aria-pressed={localeChoice === c} style={CHIP_STYLE} lang={c === 'system' ? undefined : c}
                            onClick={() => setLocaleChoice(c)}>{t(LOCALE_KEYS[c])}</button>
                    ))}
                </div>
                <div className="os-set-row" style={{ marginTop: 16 }}>
                    <div><b>{t('font.label')}</b><div className="os-set-sub">{t('font.sub')}</div></div>
                </div>
                <div className="os-chips" style={{ marginTop: 10 }}>
                    {FONT_SIZES.map(s => (
                        <button key={s} type="button" className="os-chipbtn" aria-pressed={font === s} style={CHIP_STYLE} onClick={() => 글자바꾸기(s)}>{t(FONT_KEYS[s])}</button>
                    ))}
                </div>
            </div>

            <h2>{t('sec.bot')}</h2>
            <div className="os-card">
                <div className="os-set-line">
                    <div className="os-set-text"><b>{t('tz.label')}</b><div className="os-set-hint">{t('tz.sub')}</div></div>
                    <span className="os-set-value">{t('tz.value', { tz: OS_TIMEZONE })}</span>
                </div>
                <div className="os-set-line">
                    <div className="os-set-text">
                        <b>{t('review.label')}</b>
                        <div className="os-set-hint">
                            {t('review.sub')}
                            {team && team.length > 1 && ` ${t('review.count', { n: team.length })}`}
                            {현재승인모드 === null && team && team.length > 1 && ` ${t('review.mixed')}`}
                        </div>
                    </div>
                    <Toggle label={t('review.label')} on={자동검토켬} disabled={!!승인못고르는이유 || team === null}
                        onChange={v => void 승인모드바꾸기(v ? 'always_ask' : 'auto_safe')} />
                </div>
                <button type="button" className="os-linkbtn" aria-expanded={moreOpen} onClick={() => setMoreOpen(o => !o)}>
                    {moreOpen ? t('review.less') : t('review.more')} {moreOpen ? '▴' : '▾'}
                </button>
                {moreOpen && (
                    <div className="os-approval" role="radiogroup" aria-label={t('approval.title')}>
                        {APPROVALS.map(m => (
                            <label key={m}>
                                <input type="radio" name="approval" value={m} checked={현재승인모드 === m}
                                    disabled={!!승인못고르는이유 || team === null} onChange={() => void 승인모드바꾸기(m)} />
                                <span>
                                    <b>{t(`approval.${m}` as TKey)}</b>
                                    <div className="os-set-sub">{t(`approval.${m}.sub` as TKey)}</div>
                                </span>
                            </label>
                        ))}
                    </div>
                )}
                {승인못고르는이유 && <div className="os-set-hint" style={{ marginTop: 8 }}>{승인못고르는이유}</div>}
                {approvalNote && <div className="os-set-hint warn" style={{ marginTop: 8 }}>{approvalNote}</div>}
            </div>

            <div className="os-set-sub" style={{ marginTop: 18 }}>
                {t('connect.line')} <Link href="/os/connect" className="os-set-link">{t('connect.link')}</Link>
            </div>
        </>
    )
}

/* ────────────────────────── 사용량과 요금제 ────────────────────────── */

type UsageState = { kind: 'loading' } | { kind: 'guest' } | { kind: 'fail' } | { kind: 'ok'; data: UsageLike }

function UsageTab() {
    const { t, locale } = useLocale()
    const [usage, setUsage] = useState<UsageState>({ kind: 'loading' })
    const [extra, setExtra] = useState<ExtraUsage>({ mode: 'none', amount: 0 })
    const [clover, setClover] = useState<number | null>(null)
    const [now] = useState(() => new Date())

    useEffect(() => {
        let alive = true
        void Promise.resolve().then(() => { if (alive) setExtra(readExtraUsage(window.localStorage)) })
        fetch('/api/os/usage', { cache: 'no-store' }).then(async r => {
            if (!alive) return
            if (!r.ok) { setUsage({ kind: 'fail' }); return }
            const d = await r.json()
            if (d?.guest) { setUsage({ kind: 'guest' }); return }
            setUsage({ kind: 'ok', data: d as UsageLike })
            getCreditBalance().then(n => { if (alive) setClover(n) }).catch(() => { /* 못 읽어도 화면은 산다 */ })
        }).catch(() => { if (alive) setUsage({ kind: 'fail' }) })
        return () => { alive = false }
    }, [])

    const 한도바꾸기 = (next: ExtraUsage) => {
        const 값 = saveExtraUsage(next, window.localStorage)
        setExtra(값)
        void savePrefsRemote(값)
    }

    const d = usage.kind === 'ok' ? usageDetailL(locale, usage.data, now) : null

    return (
        <>
            <h2>{t('usage.title')}</h2>
            <div className="os-card">
                {usage.kind === 'loading' && <div className="os-set-sub">{t('usage.loading')}</div>}
                {usage.kind === 'guest' && <div className="os-set-sub">{t('usage.guest')}</div>}
                {usage.kind === 'fail' && <div className="os-set-hint warn">{t('usage.fail')}</div>}
                {usage.kind === 'ok' && d && (
                    <>
                        {d.blockedText && <p className="os-usage-blocked" role="alert">{d.blockedText}</p>}
                        <section className="os-usage-sec os-usage-5h" aria-label={t('usage.5h')}>
                            <RingSvg pct={usage.data.pct5h} size={96} stroke={9} />
                            <div className="os-usage-5h-text">
                                <div className="os-usage-label">{t('usage.5h')}</div>
                                <b>{d.fiveHourText}</b>
                                <div className="os-usage-sub">{d.fiveHourReset}</div>
                            </div>
                        </section>
                        <section className="os-usage-sec" aria-label={t('usage.week')}>
                            <div className="os-usage-label">{t('usage.week')}</div>
                            <div className="os-usage-bar-track" data-tone={usageTone(usage.data.pctWeek)} role="progressbar" aria-valuemin={0} aria-valuemax={100}
                                aria-valuenow={usage.data.pctWeek} aria-label={t('usage.week')}>
                                <span style={{ width: `${Math.min(100, usage.data.pctWeek)}%` }} />
                            </div>
                            <b>{t('usage.weekLine', { pct: usage.data.pctWeek, limit: withComma(usage.data.limitWeek), used: withComma(usage.data.usedWeek) })}</b>
                            <div className="os-usage-sub">{t('usage.weekReset')}</div>
                        </section>
                    </>
                )}
            </div>

            <h2>{t('extra.label')} <span className="os-set-badge">{t('extra.soon')}</span></h2>
            <div className="os-card">
                <div className="os-set-row"><div><b>{t('extra.q')}</b></div></div>
                <div className="os-chips" style={{ marginTop: 10 }} role="radiogroup" aria-label={t('extra.label')}>
                    {EXTRA_MODES.map(m => (
                        <button key={m} type="button" role="radio" aria-checked={extra.mode === m} className="os-chipbtn" style={CHIP_STYLE}
                            onClick={() => 한도바꾸기({ mode: m, amount: m === 'fixed' ? (extra.amount || 10000) : 0 })}>{t(EXTRA_KEYS[m])}</button>
                    ))}
                </div>
                {extra.mode === 'fixed' && (
                    <label className="os-set-amount">
                        <span className="os-set-sub">{t('extra.amount')}</span>
                        <input type="number" inputMode="numeric" min={0} step={1000} value={extra.amount || ''}
                            onChange={e => 한도바꾸기({ mode: 'fixed', amount: Number(e.target.value) })} />
                    </label>
                )}
                <div className="os-set-hint" style={{ marginTop: 10 }}>{t('extra.soonSub')}</div>
            </div>

            <h2>{t('plan.label')}</h2>
            <div className="os-card">
                <div className="os-set-line">
                    <div className="os-set-text"><b>{t('plan.current')}</b></div>
                    <span className="os-set-value">{t('plan.free')}</span>
                </div>
                {usage.kind === 'ok' && (
                    <div className="os-set-line">
                        <div className="os-set-text"><b>{t('clover.label')}</b><div className="os-set-hint">{t('clover.sub')}</div></div>
                        <span className="os-set-value" style={isLowClover(clover) ? { color: 'var(--os-경고)' } : undefined}>
                            {clover === null ? t('clover.counting') : t('clover.balance', { n: withComma(clover) })}
                        </span>
                    </div>
                )}
                <div className="os-set-actions">
                    <Link href="/os/charge?from=/os/settings" className="os-btn primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>{t('plan.manage')}</Link>
                    {usage.kind === 'ok' && (
                        <Link href="/os/charge?from=/os/settings" className="os-btn" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>{t('clover.charge')}</Link>
                    )}
                </div>
            </div>
        </>
    )
}

/* ────────────────────────── 앱 ────────────────────────── */

function isStandalone(): boolean {
    const nav = window.navigator as Navigator & { standalone?: boolean }
    return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

function AppTab({ version }: { version: string }) {
    const { t } = useLocale()
    /** null = 아직 모름(서버) / true = 이미 앱으로 열림 / false = 설치 안내를 보여 준다 */
    const [installed, setInstalled] = useState<boolean | null>(null)

    useEffect(() => {
        void Promise.resolve().then(() => {
            // 설정에 직접 들어와 「앱」 탭을 열었다 = 안내를 보고 싶은 것. 명단에서 「7일 동안 닫기」 했어도 여기서는 다시 보여 준다
            try { localStorage.removeItem('curi-install-hide-until') } catch { /* 무시 */ }
            setInstalled(isStandalone())
        })
    }, [])

    return (
        <>
            <h2>{t('app.install')}</h2>
            <div className="os-card">
                <div className="os-set-sub">{installed ? t('app.installed') : t('app.installSub')}</div>
                {installed === false && <div className="os-set-install"><InstallPrompt /></div>}
            </div>

            <h2>{t('app.version')}</h2>
            <div className="os-card">
                <div className="os-set-line">
                    <div className="os-set-text"><b>{t('app.latest')}</b><div className="os-set-hint">{t('app.latestSub')}</div></div>
                    <span className="os-set-value">v{version}</span>
                </div>
            </div>
        </>
    )
}
