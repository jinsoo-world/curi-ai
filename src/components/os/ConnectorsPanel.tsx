'use client'
// 연결 설정 조각 — /os/settings 안에 끼운다: <ConnectorsPanel />
//
// 노션, 슬랙은 지금 붙일 수 있고, 카톡, 인스타, 큐리어스는 칸만 있고 「준비 중」이다.
// 붙여 넣은 열쇠는 다시 보여 주지 않는다(끝 4자만). 색은 os 토큰만 쓴다.

import { useCallback, useEffect, useState } from 'react'
import { CONNECTOR_INFO, CONNECTOR_KINDS, type ConnectorKind, type ConnectorView } from '@/domains/connectors/types'

/** 서비스 로고(벡터라 어느 크기에서도 선명). public/logos/ 에 우리가 그린 단순 마크 */
const LOGO: Record<ConnectorKind, string> = {
    notion: '/logos/notion.svg', slack: '/logos/slack.svg', kakao: '/logos/kakao.svg', instagram: '/logos/instagram.svg', curious: '/logos/curious.svg',
}

const sub: React.CSSProperties = { fontSize: 13, color: 'var(--os-글-흐림)', marginTop: 2, lineHeight: 1.5 }
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 }
const input: React.CSSProperties = {
    width: '100%', background: 'var(--os-말풍선-내)', color: 'var(--os-글)', border: '1px solid var(--os-선)',
    borderRadius: 10, padding: '10px 12px', fontSize: 15, minHeight: 44, marginTop: 8,
}

export default function ConnectorsPanel() {
    const [enabled, setEnabled] = useState(true)
    const [list, setList] = useState<ConnectorView[]>([])
    const [open, setOpen] = useState<ConnectorKind | null>(null)
    const [secret, setSecret] = useState('')
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState<string | null>(null)
    const [loaded, setLoaded] = useState(false)

    const load = useCallback(async () => {
        try {
            const r = await fetch('/api/os/connectors', { cache: 'no-store' })
            if (r.status === 401) { setLoaded(true); return }
            const d = await r.json()
            setEnabled(d?.enabled !== false)
            setList(Array.isArray(d?.connectors) ? d.connectors as ConnectorView[] : [])
        } catch { /* 못 읽어도 화면은 산다 */ }
        setLoaded(true)
    }, [])

    // 효과 본문에서 바로 setState 하지 않는다(린트 규칙) — 한 박자 뒤에 읽어 온다
    useEffect(() => { void Promise.resolve().then(load) }, [load])

    const 붙이기 = async (kind: ConnectorKind) => {
        const 값 = secret.trim()
        if (!값 || busy) return
        setBusy(true); setNote(null)
        try {
            const r = await fetch('/api/os/connectors', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind, label: CONNECTOR_INFO[kind].name, secret: 값 }),
            })
            const d = await r.json()
            if (!r.ok) setNote(String(d?.error ?? '붙이지 못했어요'))
            else { setNote(`${CONNECTOR_INFO[kind].name}을(를) 붙였어요`); setSecret(''); setOpen(null); await load() }
        } catch {
            setNote('붙이지 못했어요. 잠시 뒤 다시 해 주세요')
        }
        setBusy(false)
    }

    const 떼기 = async (c: ConnectorView) => {
        if (!confirm(`${CONNECTOR_INFO[c.kind].name} 연결을 뗄까요?`)) return
        setBusy(true); setNote(null)
        try {
            await fetch('/api/os/connectors', {
                method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: c.id }),
            })
            await load()
        } catch { setNote('떼지 못했어요') }
        setBusy(false)
    }

    const 확인 = async (c: ConnectorView) => {
        if (c.kind === 'slack' && !confirm('슬랙 방에 확인용 글 한 줄이 올라가요. 올릴까요?')) return
        setBusy(true); setNote(null)
        try {
            const r = await fetch(`/api/os/connectors/${c.id}/test`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirm: true }),
            })
            const d = await r.json()
            setNote(String(d?.message ?? d?.error ?? '확인했어요'))
            await load()
        } catch { setNote('확인하지 못했어요') }
        setBusy(false)
    }

    const 붙은것 = (kind: ConnectorKind) => list.filter(c => c.kind === kind)

    return (
        <div className="os-card">
            <div style={row}>
                <div>
                    <b>연결</b>
                    <div style={sub}>내 노션, 슬랙을 봇에게 이어 줘요. 읽기는 알아서, 보내기는 꼭 물어보고 해요.</div>
                </div>
            </div>

            {!enabled && loaded && (
                <div style={{ ...sub, marginTop: 10, color: 'var(--os-경고)' }}>
                    연결 기능은 아직 준비 중이에요(서버 설정이 필요해요).
                </div>
            )}

            {CONNECTOR_KINDS.map(kind => {
                const info = CONNECTOR_INFO[kind]
                const 목록 = 붙은것(kind)
                const 쓸수있나 = info.ready && enabled
                return (
                    <div key={kind} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--os-선)' }}>
                        <div className="os-conn-head">
                            {/* 로고는 우리가 그린 정적 SVG 라 next/image 최적화 대상이 아니다 */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img className="os-conn-logo" src={LOGO[kind]} alt={info.name} width={32} height={32} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="os-conn-name">
                                    <b>{info.name}</b>
                                    <span className={`os-conn-state${목록.length > 0 ? ' on' : ''}`}>{목록.length > 0 ? '연결됨' : '연결 안 됨'}</span>
                                </div>
                                <div style={sub}>{info.hint}</div>
                            </div>
                            {쓸수있나 ? (
                                <button type="button" className="os-btn" style={{ minHeight: 44 }} disabled={busy}
                                    onClick={() => { setOpen(open === kind ? null : kind); setSecret(''); setNote(null) }}>
                                    {open === kind ? '닫기' : '연결하기'}
                                </button>
                            ) : (
                                <span style={{ fontSize: 13, color: 'var(--os-글-흐림)', flexShrink: 0 }}>준비 중</span>
                            )}
                        </div>

                        {목록.map(c => (
                            <div key={c.id} style={{ ...row, marginTop: 8 }}>
                                <div>
                                    <span>{c.label} {c.secretHint}</span>
                                    <div style={sub}>{c.status === 'error' ? '⚠ 지난번에 닿지 못했어요' : `쓸 수 있어요 / ${info.can}`}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                    <button type="button" className="os-btn" style={{ minHeight: 44 }} disabled={busy} onClick={() => void 확인(c)}>확인</button>
                                    <button type="button" className="os-btn" style={{ minHeight: 44 }} disabled={busy} onClick={() => void 떼기(c)}>떼기</button>
                                </div>
                            </div>
                        ))}

                        {open === kind && (
                            <div style={{ marginTop: 8 }}>
                                <input style={input} value={secret} placeholder={info.placeholder}
                                    onChange={e => setSecret(e.target.value)} autoComplete="off" spellCheck={false} />
                                <div style={sub}>
                                    {kind === 'notion'
                                        ? '노션 → 설정 → 연결 → 내 통합 만들기 → 토큰 복사. 그 다음 읽게 할 문서에서 ⋯ → 연결 로 그 통합을 더해 주세요.'
                                        : '슬랙 → 앱 → Incoming Webhooks → 방 고르고 주소 복사.'}
                                </div>
                                <button type="button" className="os-btn primary" style={{ marginTop: 10, minHeight: 44 }}
                                    disabled={busy || !secret.trim()} onClick={() => void 붙이기(kind)}>붙이기</button>
                            </div>
                        )}
                    </div>
                )
            })}

            {note && <div style={{ ...sub, marginTop: 10 }}>{note}</div>}
        </div>
    )
}
