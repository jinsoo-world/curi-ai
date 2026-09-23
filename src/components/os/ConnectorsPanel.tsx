'use client'
// 서비스 연결 목록 = /os/connect 「서비스」 탭. (옛 자리였던 /os/settings 에서도 그대로 끼울 수 있다)
//
// 13개 서비스를 한 줄씩: 왼쪽 32px 로고, 이름, 상태 배지, 오른쪽 단추(연결하기 / 해제).
// 붙이는 길 = 사용자 본인 계정 로그인(OAuth). 서버 열쇠가 없는 서비스는 「준비 중」 배지 + 비활성 단추.
// 노션·슬랙은 OAuth 열쇠가 아직 없을 때 열쇠를 손으로 붙여 넣는 옛길을 남겨 둔다.
// ⚠️ 이 파일은 브라우저에서 돌므로 domains 의 값(crypto 를 끌고 오는 것)을 가져오지 않는다. 타입만.

import { useCallback, useEffect, useState } from 'react'
import type { ProviderView } from '@/domains/connectors/providers'
import './connect.css'

type Service = ProviderView & {
    connected: { id: string; account: string; status: 'connected' | 'error' } | null
}

/** 열쇠를 손으로 붙여 넣을 수 있는 두 개(서버 /api/os/connectors 의 READY_KINDS 와 같다) */
const PASTE: Record<string, { placeholder: string; how: string }> = {
    notion: {
        placeholder: 'ntn_ 로 시작하는 내 통합 토큰',
        how: '노션 → 설정 → 연결 → 내 통합 만들기 → 토큰 복사. 읽게 할 문서에서 「연결」로 그 통합을 더해 주세요.',
    },
    slack: {
        placeholder: 'https://hooks.slack.com/services/... 웹훅 주소',
        how: '슬랙 → 앱 → Incoming Webhooks → 방 고르고 주소 복사.',
    },
}

/** 돌아온 주소(?connected= / ?error=)를 사람 말로 */
const ERROR_TEXT: Record<string, string> = {
    denied: '연결을 허용하지 않아서 그대로 두었어요.',
    bad_state: '연결 시작한 지 10분이 지났거나 창이 달라요. 다시 눌러 주세요.',
    not_ready: '이 서비스는 아직 준비 중이에요(관리자가 열쇠를 등록해야 해요).',
    token: '서비스가 열쇠를 주지 않았어요. 잠시 뒤 다시 해 주세요.',
    table: '연결 기능이 아직 준비 중이에요(서버 설정이 필요해요).',
    save: '연결을 저장하지 못했어요. 잠시 뒤 다시 해 주세요.',
    unknown: '모르는 서비스예요.',
}

export default function ConnectorsPanel() {
    const [services, setServices] = useState<Service[]>([])
    const [enabled, setEnabled] = useState(true)
    const [loggedIn, setLoggedIn] = useState(true)
    const [loaded, setLoaded] = useState(false)
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState<{ text: string; warn?: boolean } | null>(null)
    const [pasteOpen, setPasteOpen] = useState<string | null>(null)
    const [secret, setSecret] = useState('')

    const load = useCallback(async () => {
        try {
            const r = await fetch('/api/connect', { cache: 'no-store' })
            const d = await r.json()
            setEnabled(d?.enabled !== false)
            setLoggedIn(d?.loggedIn !== false)
            setServices(Array.isArray(d?.services) ? d.services as Service[] : [])
        } catch { /* 못 읽어도 화면은 산다 */ }
        setLoaded(true)
    }, [])

    // 효과 본문에서 바로 setState 하지 않는다(린트 규칙) — 한 박자 뒤에 읽어 온다
    useEffect(() => { void Promise.resolve().then(load) }, [load])

    // 서비스 로그인에서 돌아온 결과를 한 번 보여 주고 주소를 깨끗하게 한다
    useEffect(() => {
        void Promise.resolve().then(() => {
            const q = new URLSearchParams(window.location.search)
            const ok = q.get('connected')
            const err = q.get('error')
            if (!ok && !err) return
            if (ok) setNote({ text: '연결했어요. 이제 봇이 이 서비스를 쓸 수 있어요.' })
            else setNote({ text: ERROR_TEXT[err ?? ''] ?? '연결하지 못했어요. 다시 해 주세요.', warn: true })
            const clean = new URL(window.location.href)
            clean.searchParams.delete('connected'); clean.searchParams.delete('error'); clean.searchParams.delete('provider')
            window.history.replaceState(null, '', clean.pathname + (clean.search || ''))
        })
    }, [])

    const 연결하기 = (s: Service) => {
        if (!loggedIn) { window.location.assign('/login?next=/os/connect'); return }
        window.location.assign(`/api/connect/${s.id}/start`)
    }

    const 해제 = async (s: Service) => {
        if (!s.connected || !confirm(`${s.name} 연결을 해제할까요? 봇이 더는 이 서비스를 못 써요.`)) return
        setBusy(true); setNote(null)
        try {
            const r = await fetch('/api/os/connectors', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.connected.id }),
            })
            if (!r.ok) setNote({ text: '해제하지 못했어요. 잠시 뒤 다시 해 주세요.', warn: true })
            else setNote({ text: `${s.name} 연결을 해제했어요.` })
            await load()
        } catch { setNote({ text: '해제하지 못했어요.', warn: true }) }
        setBusy(false)
    }

    const 붙이기 = async (s: Service) => {
        const 값 = secret.trim()
        if (!값 || busy) return
        setBusy(true); setNote(null)
        try {
            const r = await fetch('/api/os/connectors', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: s.id, label: s.name, secret: 값 }),
            })
            const d = await r.json()
            if (!r.ok) setNote({ text: String(d?.error ?? '붙이지 못했어요'), warn: true })
            else { setNote({ text: `${s.name}을(를) 붙였어요.` }); setSecret(''); setPasteOpen(null); await load() }
        } catch { setNote({ text: '붙이지 못했어요. 잠시 뒤 다시 해 주세요.', warn: true }) }
        setBusy(false)
    }

    const 배지 = (s: Service) => {
        if (s.connected?.status === 'error') return <span className="os-svc-badge bad">다시 연결 필요</span>
        if (s.connected) return <span className="os-svc-badge on">연결됨 ({s.connected.account})</span>
        if (s.comingSoon) return <span className="os-svc-badge soon">준비 중</span>
        if (!s.ready) return <span className="os-svc-badge soon">준비 중 (관리자가 열쇠를 등록해야 해요)</span>
        return <span className="os-svc-badge">연결 안 됨</span>
    }

    return (
        <div className="os-card">
            {!enabled && loaded && (
                <div className="os-connect-note warn" style={{ marginTop: 12 }}>연결 기능은 아직 준비 중이에요(서버 설정이 필요해요).</div>
            )}
            {note && <div className={`os-connect-note${note.warn ? ' warn' : ''}`} style={{ marginTop: 12 }}>{note.text}</div>}

            {services.map(s => {
                const paste = !s.ready && !s.comingSoon && enabled && PASTE[s.id]
                const canConnect = s.ready && enabled
                return (
                    <div key={s.id}>
                        <div className="os-svc">
                            {/* 로고는 우리가 그린 정적 SVG 라 next/image 최적화 대상이 아니다 */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="os-svc-logo" src={s.logo} alt="" width={32} height={32} />
                            <div className="os-svc-body">
                                <div className="os-svc-name"><b>{s.name}</b>{배지(s)}</div>
                                <div className="os-svc-hint">{s.connected ? `쓸 수 있어요. ${s.can}` : s.hint}</div>
                            </div>
                            <div className="os-svc-act">
                                {s.connected ? (
                                    <button type="button" className="os-btn" disabled={busy} onClick={() => void 해제(s)}>해제</button>
                                ) : paste ? (
                                    <button type="button" className="os-btn" disabled={busy}
                                        onClick={() => { setPasteOpen(pasteOpen === s.id ? null : s.id); setSecret(''); setNote(null) }}>
                                        {pasteOpen === s.id ? '닫기' : '열쇠 붙이기'}
                                    </button>
                                ) : (
                                    <button type="button" className="os-btn primary" disabled={!canConnect || busy} onClick={() => 연결하기(s)}>연결하기</button>
                                )}
                            </div>
                        </div>

                        {paste && pasteOpen === s.id && (
                            <div className="os-svc-more">
                                <input className="os-connect-input" value={secret} placeholder={PASTE[s.id].placeholder}
                                    onChange={e => setSecret(e.target.value)} autoComplete="off" spellCheck={false} />
                                <div className="os-svc-hint" style={{ marginTop: 6 }}>{PASTE[s.id].how}</div>
                                <button type="button" className="os-btn primary" style={{ marginTop: 10, minHeight: 44 }}
                                    disabled={busy || !secret.trim()} onClick={() => void 붙이기(s)}>붙이기</button>
                            </div>
                        )}
                    </div>
                )
            })}

            {loaded && services.length === 0 && <div className="os-svc-hint" style={{ padding: '12px 0' }}>목록을 읽지 못했어요. 잠시 뒤 다시 열어 주세요.</div>}
        </div>
    )
}
