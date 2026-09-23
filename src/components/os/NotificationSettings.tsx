'use client'
// 알림 설정 조각 — /os/settings 「알림」 탭에 끼운다: <NotificationSettings />
// 푸시 켜기(권한, 구독) / 문자 토글(번호는 가려서) / 이메일 토글 / 조용한 시간. 색은 os 토큰만, 글자는 사전(i18n)에서.
// 토글은 누르면 화면이 먼저 바뀌고 저장은 뒤에서 한다. 못 켜는 토글은 왜 못 켜는지 옆에 한 줄로 보인다.

import { useCallback, useEffect, useState } from 'react'
import { enablePush, disablePush, getPushState, needsHomeScreen, type PushState } from '@/lib/push-client'
import type { NotificationPrefs } from '@/domains/messaging/types'
import { useLocale } from '@/components/os/LocaleProvider'

type Info = {
    prefs: NotificationPrefs
    phoneMasked: string
    emailMasked: string
    pushConfigured: boolean
    vapidPublicKey: string | null
    smsAvailable: boolean
    emailAvailable: boolean
}

/** iOS 식 토글(설정 화면 공용). 모양은 settings.css 의 .os-ios-switch */
export function Toggle({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
            className="os-ios-switch" onClick={() => onChange(!on)}>
            <span />
        </button>
    )
}

export default function NotificationSettings() {
    const { t } = useLocale()
    const [info, setInfo] = useState<Info | null>(null)
    /** null = 아직 읽는 중, 'guest' = 로그인 안 함, 'fail' = 서버가 못 줌 */
    const [loadState, setLoadState] = useState<null | 'ok' | 'guest' | 'fail'>(null)
    const [push, setPush] = useState<PushState>('off')
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState<string | null>(null)

    const load = useCallback(async () => {
        try {
            const r = await fetch('/api/os/notification-prefs', { cache: 'no-store' })
            if (r.status === 401) { setLoadState('guest'); return }
            if (!r.ok) { setLoadState('fail'); return }
            setInfo(await r.json())
            setLoadState('ok')
        } catch { setLoadState('fail') }
        setPush(await getPushState())
    }, [])
    // 효과 본문에서 바로 setState 하지 않는다(린트 규칙) — 한 박자 뒤에 읽어 온다
    useEffect(() => { void Promise.resolve().then(load) }, [load])

    /** 화면 먼저 바꾸고(낙관적) 저장은 뒤에서. 실패하면 원래대로 되돌리고 한 줄 알린다 */
    const patch = async (p: Partial<NotificationPrefs>) => {
        if (!info) return
        const prev = info.prefs
        setNote(null)
        setInfo({ ...info, prefs: { ...prev, ...p } })
        try {
            const r = await fetch('/api/os/notification-prefs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
            if (!r.ok) {
                const j = await r.json().catch(() => ({}))
                setNote(j.error || t('review.saveFail'))
                setInfo({ ...info, prefs: prev })
            }
        } catch {
            setNote(t('noti.netFail'))
            setInfo({ ...info, prefs: prev })
        }
    }

    const togglePush = async (on: boolean) => {
        if (!info) return
        setBusy(true); setNote(null)
        try {
            if (on) {
                if (!info.vapidPublicKey) { setNote(t('noti.noKey')); return }
                const r = await enablePush(info.vapidPublicKey)
                if (!r.ok) { setNote(r.error); return }
                await patch({ push: true })
            } else {
                await disablePush()
                await patch({ push: false })
            }
            setPush(await getPushState())
        } finally { setBusy(false) }
    }

    if (loadState === 'guest') return <div className="os-card">{t('noti.guest')}</div>
    if (loadState === 'fail') return <div className="os-card">{t('noti.fail')}</div>
    if (!info) return <div className="os-card">{t('noti.loading')}</div>

    const { prefs } = info
    const pushOn = push === 'on' && prefs.push
    const pushLocked = push === 'unsupported' || push === 'denied'
    const pushHint = push === 'unsupported'
        ? (needsHomeScreen() ? t('noti.push.ios') : t('noti.push.unsupported'))
        : push === 'denied' ? t('noti.push.denied')
        : pushOn ? t('noti.push.on') : t('noti.push.off')

    const smsLocked = !info.smsAvailable || !info.phoneMasked
    const smsHint = !info.smsAvailable ? t('noti.sms.soon')
        : !info.phoneMasked ? t('noti.sms.noPhone')
        : t('noti.sms.to', { phone: info.phoneMasked })

    const emailLocked = !info.emailMasked
    const emailHint = !info.emailMasked ? t('noti.email.none')
        : `${info.emailMasked}${info.emailAvailable ? '' : t('noti.email.notReady')}`

    /** 「22:00 부터」(한국어, 일본어) 인가 「from 22:00」(영어) 인가 */
    const wordFirst = t('noti.quietOrder') === 'prefix'
    const timeInput = (which: 'quietFrom' | 'quietTo', fallback: string, label: string) => (
        <input type="time" aria-label={label} value={prefs[which] ?? fallback} onChange={e => patch({ [which]: e.target.value })} />
    )

    return (
        <div>
            <div className="os-card">
                <div className="os-set-line">
                    <div className="os-set-text"><b>{t('noti.push')}</b><div className={`os-set-hint${pushLocked ? ' warn' : ''}`}>{pushHint}</div></div>
                    <Toggle label={t('noti.push')} on={pushOn} disabled={busy || pushLocked} onChange={togglePush} />
                </div>
                <div className="os-set-line">
                    <div className="os-set-text"><b>{t('noti.sms')}</b><div className={`os-set-hint${smsLocked ? ' warn' : ''}`}>{smsHint}</div></div>
                    <Toggle label={t('noti.sms')} on={prefs.sms} disabled={smsLocked} onChange={v => patch({ sms: v })} />
                </div>
                <div className="os-set-line">
                    <div className="os-set-text"><b>{t('noti.email')}</b><div className={`os-set-hint${emailLocked ? ' warn' : ''}`}>{emailHint}</div></div>
                    <Toggle label={t('noti.email')} on={prefs.email} disabled={emailLocked} onChange={v => patch({ email: v })} />
                </div>
            </div>

            <h4 style={{ marginTop: 14 }}>{t('noti.quiet')}</h4>
            <div className="os-card">
                <div className="os-set-line">
                    <div className="os-quiet">
                        <span className="os-quiet-pair">
                            {wordFirst && <span>{t('noti.from')}</span>}
                            {timeInput('quietFrom', '22:00', t('noti.quietFrom'))}
                            {!wordFirst && <span>{t('noti.from')}</span>}
                        </span>
                        <span className="os-quiet-pair">
                            {wordFirst && <span>{t('noti.to')}</span>}
                            {timeInput('quietTo', '08:00', t('noti.quietTo'))}
                            {!wordFirst && <span>{t('noti.to')}</span>}
                        </span>
                    </div>
                </div>
                <div className="os-set-hint" style={{ marginTop: 6 }}>{t('noti.quietSub')}</div>
            </div>
            {note && <div className="os-card" style={{ marginTop: 10, color: 'var(--os-경고)' }}>{note}</div>}
        </div>
    )
}
