'use client'
// 알림 설정 조각 — /os/settings 안에 끼운다: <NotificationSettings />  (제목 「알림」은 페이지가 찍는다)
// 푸시 켜기(권한, 구독) / 문자 토글(번호는 가려서) / 이메일 토글 / 조용한 시간. 색은 os 토큰만 쓴다.
// 토글은 누르면 화면이 먼저 바뀌고 저장은 뒤에서 한다. 못 켜는 토글은 왜 못 켜는지 옆에 한 줄로 보인다.

import { useCallback, useEffect, useState } from 'react'
import { enablePush, disablePush, getPushState, needsHomeScreen, type PushState } from '@/lib/push-client'
import type { NotificationPrefs } from '@/domains/messaging/types'

type Info = {
    prefs: NotificationPrefs
    phoneMasked: string
    emailMasked: string
    pushConfigured: boolean
    vapidPublicKey: string | null
    smsAvailable: boolean
    emailAvailable: boolean
}

function Toggle({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
            className="os-ios-switch" onClick={() => onChange(!on)}>
            <span />
        </button>
    )
}

export default function NotificationSettings() {
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
                setNote(j.error || '저장 못 했어요. 잠시 뒤 다시 눌러 주세요.')
                setInfo({ ...info, prefs: prev })
            }
        } catch {
            setNote('저장 못 했어요. 인터넷을 확인해 주세요.')
            setInfo({ ...info, prefs: prev })
        }
    }

    const togglePush = async (on: boolean) => {
        if (!info) return
        setBusy(true); setNote(null)
        try {
            if (on) {
                if (!info.vapidPublicKey) { setNote('푸시 열쇠가 아직 서버에 없어요(관리자에게 알려 주세요).'); return }
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

    if (loadState === 'guest') return <div className="os-card">로그인하면 알림을 켤 수 있어요.</div>
    if (loadState === 'fail') return <div className="os-card">알림 설정을 못 불러왔어요. 잠시 뒤 다시 열어 주세요.</div>
    if (!info) return <div className="os-card">알림 설정을 불러오는 중…</div>

    const { prefs } = info
    const pushOn = push === 'on' && prefs.push
    const pushLocked = push === 'unsupported' || push === 'denied'
    const pushHint = push === 'unsupported'
        ? (needsHomeScreen() ? '아이폰은 사파리 공유 단추 → 「홈 화면에 추가」한 앱에서 켤 수 있어요' : '이 브라우저는 푸시를 지원하지 않아요')
        : push === 'denied' ? '브라우저 설정에서 알림이 차단돼 있어요. 풀어 주면 켤 수 있어요'
        : pushOn ? '이 기기로 알림이 와요' : '루틴 결과, 승인 요청이 오면 바로 알려 드려요'

    const smsLocked = !info.smsAvailable || !info.phoneMasked
    const smsHint = !info.smsAvailable ? '문자 보내기는 준비 중이라 아직 켤 수 없어요'
        : !info.phoneMasked ? '전화번호가 없어 문자를 켤 수 없어요. 내 계정에서 번호를 넣어 주세요'
        : `${info.phoneMasked} 로 보내요`

    const emailLocked = !info.emailMasked
    const emailHint = !info.emailMasked ? '이메일이 없어 켤 수 없어요. 내 계정에서 이메일을 넣어 주세요'
        : `${info.emailMasked}${info.emailAvailable ? '' : ' (서버 준비 중이라 지금은 안 가요)'}`

    return (
        <div>
            <div className="os-card">
                <div className="os-set-line">
                    <div className="os-set-text"><b>푸시</b><div className={`os-set-hint${pushLocked ? ' warn' : ''}`}>{pushHint}</div></div>
                    <Toggle label="푸시" on={pushOn} disabled={busy || pushLocked} onChange={togglePush} />
                </div>
                <div className="os-set-line">
                    <div className="os-set-text"><b>문자</b><div className={`os-set-hint${smsLocked ? ' warn' : ''}`}>{smsHint}</div></div>
                    <Toggle label="문자" on={prefs.sms} disabled={smsLocked} onChange={v => patch({ sms: v })} />
                </div>
                <div className="os-set-line">
                    <div className="os-set-text"><b>이메일</b><div className={`os-set-hint${emailLocked ? ' warn' : ''}`}>{emailHint}</div></div>
                    <Toggle label="이메일" on={prefs.email} disabled={emailLocked} onChange={v => patch({ email: v })} />
                </div>
            </div>

            <h4 style={{ marginTop: 14 }}>조용한 시간</h4>
            <div className="os-card">
                <div className="os-set-line">
                    <div className="os-quiet">
                        <span className="os-quiet-pair">
                            <input type="time" aria-label="조용한 시간 시작" value={prefs.quietFrom ?? '22:00'} onChange={e => patch({ quietFrom: e.target.value })} />
                            <span>부터</span>
                        </span>
                        <span className="os-quiet-pair">
                            <input type="time" aria-label="조용한 시간 끝" value={prefs.quietTo ?? '08:00'} onChange={e => patch({ quietTo: e.target.value })} />
                            <span>까지</span>
                        </span>
                    </div>
                </div>
                <div className="os-set-hint" style={{ marginTop: 6 }}>이 시간엔 푸시, 문자를 보내지 않아요. 이메일은 가요. (한국 시간)</div>
            </div>
            {note && <div className="os-card" style={{ marginTop: 10, color: 'var(--os-경고)' }}>{note}</div>}
        </div>
    )
}
