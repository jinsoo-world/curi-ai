'use client'
// 알림 설정 조각 — /os/settings 안에 끼운다: <NotificationSettings />
// 푸시 켜기(권한, 구독) / 문자 토글(번호는 가려서) / 이메일 토글 / 조용한 시간. 색은 os 토큰만 쓴다.

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

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }
const sub: React.CSSProperties = { fontSize: 13, color: 'var(--os-글-흐림)', marginTop: 2 }
const timeInput: React.CSSProperties = { background: 'var(--os-말풍선-내)', color: 'var(--os-글)', border: '1px solid var(--os-선)', borderRadius: 10, padding: '8px 10px', fontSize: 15 }

function Toggle({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <button
            type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
            onClick={() => onChange(!on)}
            style={{
                width: 52, height: 30, borderRadius: 15, border: 0, cursor: disabled ? 'default' : 'pointer', position: 'relative', flexShrink: 0,
                background: on ? 'var(--os-클로버)' : 'var(--os-말풍선-내)', opacity: disabled ? .45 : 1, transition: 'background .15s',
            }}
        >
            <span style={{ position: 'absolute', top: 3, left: on ? 25 : 3, width: 24, height: 24, borderRadius: 12, background: '#fff', transition: 'left .15s' }} />
        </button>
    )
}

export default function NotificationSettings() {
    const [info, setInfo] = useState<Info | null>(null)
    const [push, setPush] = useState<PushState>('off')
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState<string | null>(null)

    const load = useCallback(async () => {
        const r = await fetch('/api/os/notification-prefs', { cache: 'no-store' })
        if (r.ok) setInfo(await r.json())
        setPush(await getPushState())
    }, [])
    useEffect(() => { load() }, [load])

    const patch = async (p: Partial<NotificationPrefs>) => {
        if (!info) return
        const prev = info.prefs
        setInfo({ ...info, prefs: { ...prev, ...p } })
        const r = await fetch('/api/os/notification-prefs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) })
        if (!r.ok) {
            const j = await r.json().catch(() => ({}))
            setNote(j.error || '저장하지 못했어요')
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

    if (!info) return <div className="os-card">알림 설정을 불러오는 중…</div>

    const { prefs } = info
    const pushOn = push === 'on' && prefs.push
    const pushHint = push === 'unsupported' ? '이 브라우저는 푸시를 지원하지 않아요'
        : push === 'denied' ? '브라우저 설정에서 알림이 차단돼 있어요'
        : needsHomeScreen() ? '아이폰은 「홈 화면에 추가」한 앱에서 켤 수 있어요'
        : pushOn ? '이 기기로 알림이 와요' : '루틴 결과, 승인 요청이 오면 바로 알려 드려요'

    return (
        <div>
            <h4>알림</h4>
            <div className="os-card" style={{ display: 'grid', gap: 14 }}>
                <div style={row}>
                    <div><b>푸시</b><div style={sub}>{pushHint}</div></div>
                    <Toggle label="푸시" on={pushOn} disabled={busy || push === 'unsupported' || push === 'denied'} onChange={togglePush} />
                </div>
                <div style={row}>
                    <div>
                        <b>문자</b>
                        <div style={sub}>
                            {!info.smsAvailable ? '준비 중이에요' : info.phoneMasked ? `${info.phoneMasked} 로 보내요` : '등록된 전화번호가 없어요'}
                        </div>
                    </div>
                    <Toggle label="문자" on={prefs.sms} disabled={!info.smsAvailable || !info.phoneMasked} onChange={v => patch({ sms: v })} />
                </div>
                <div style={row}>
                    <div><b>이메일</b><div style={sub}>{info.emailMasked || '이메일이 없어요'}{!info.emailAvailable && ' / 서버 준비 중'}</div></div>
                    <Toggle label="이메일" on={prefs.email} disabled={!info.emailMasked} onChange={v => patch({ email: v })} />
                </div>
            </div>

            <h4>조용한 시간</h4>
            <div className="os-card">
                <div style={{ ...row, justifyContent: 'flex-start' }}>
                    <input type="time" aria-label="조용한 시간 시작" style={timeInput} value={prefs.quietFrom ?? '22:00'} onChange={e => patch({ quietFrom: e.target.value })} />
                    <span style={{ color: 'var(--os-글-연)' }}>부터</span>
                    <input type="time" aria-label="조용한 시간 끝" style={timeInput} value={prefs.quietTo ?? '08:00'} onChange={e => patch({ quietTo: e.target.value })} />
                    <span style={{ color: 'var(--os-글-연)' }}>까지</span>
                </div>
                <div style={sub}>이 시간엔 푸시, 문자를 보내지 않아요. 이메일은 가요. (한국 시간)</div>
            </div>
            {note && <div className="os-card" style={{ marginTop: 10, color: 'var(--os-경고)' }}>{note}</div>}
        </div>
    )
}
