'use client'

// 웹 회원 탈퇴 (2026-10-02, 앱스토어 5.1.1(v)). 프로필과 설정 맨 아래에 둔다.
// 창구 = POST /api/account/delete { confirm: '탈퇴' }. 구독이 남아 있으면 서버가 409 로 막고, 여기서 바로 해지할 수 있게 한다.
// 성공하면 로그아웃하고 첫 화면으로 간다.
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DELETE_WORD, DELETE_WARNING, isDeleteWordTyped, interpretDeleteResponse } from '@/domains/account/delete-client'

const RED = '#D93025'

export default function DeleteAccountSection() {
    const [open, setOpen] = useState(false)
    const [typed, setTyped] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [subMsg, setSubMsg] = useState<string | null>(null)
    const [note, setNote] = useState<string | null>(null)

    const close = () => { if (busy) return; setOpen(false); setTyped(''); setErr(null); setSubMsg(null); setNote(null) }

    const remove = async () => {
        setBusy(true); setErr(null); setNote(null)
        try {
            const res = await fetch('/api/account/delete', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: DELETE_WORD }),
            })
            const out = interpretDeleteResponse(res.status, await res.json().catch(() => null))
            if (out.kind === 'done') {
                await createClient().auth.signOut().catch(() => {})
                window.location.href = '/'
                return
            }
            if (out.kind === 'active_subscription') setSubMsg(out.message)
            else setErr(out.message)
        } catch {
            setErr('잠시 후 다시 해 주세요.')
        } finally {
            setBusy(false)
        }
    }

    const cancelSub = async () => {
        setBusy(true); setErr(null)
        try {
            const res = await fetch('/api/billing/cancel', { method: 'POST' })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error || '구독을 해지하지 못했어요')
            setSubMsg(null)
            setNote('구독을 해지했어요. 이제 탈퇴할 수 있어요.')
        } catch (e) {
            setErr(e instanceof Error ? e.message : '구독을 해지하지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    const btn: React.CSSProperties = { minHeight: 48, padding: '0 18px', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer' }

    return (
        <>
            <button type="button" onClick={() => setOpen(true)} style={{
                width: '100%', minHeight: 48, padding: '14px 24px', background: 'none', border: 'none',
                fontSize: 15, fontWeight: 500, color: RED, cursor: 'pointer', textAlign: 'left',
            }}>회원 탈퇴</button>

            {open && (
                <div role="presentation" onClick={close} style={{
                    position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)',
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                }}>
                    <div role="dialog" aria-modal="true" aria-labelledby="delete-account-title" onClick={e => e.stopPropagation()} style={{
                        width: '100%', maxWidth: 480, background: '#fff', color: 'var(--color-neutral-900)',
                        borderRadius: '20px 20px 0 0', padding: '24px 20px calc(24px + env(safe-area-inset-bottom))', boxSizing: 'border-box',
                    }}>
                        <h3 id="delete-account-title" style={{ fontSize: 20, fontWeight: 800, margin: '0 0 10px' }}>회원 탈퇴</h3>
                        <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--color-neutral-600)', margin: '0 0 16px' }}>{DELETE_WARNING}</p>
                        <label htmlFor="delete-account-word" style={{ display: 'block', fontSize: 14, color: 'var(--color-neutral-600)', marginBottom: 6 }}>
                            계속하려면 아래 칸에 {DELETE_WORD} 라고 적어 주세요.
                        </label>
                        <input id="delete-account-word" value={typed} onChange={e => setTyped(e.target.value)} autoComplete="off"
                            placeholder={DELETE_WORD} style={{
                                width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '12px 14px', borderRadius: 12,
                                border: '1px solid var(--color-neutral-200)', color: 'var(--color-neutral-900)', background: '#fff',
                            }} />

                        {subMsg && (
                            <div role="alert" style={{ background: '#fff7ed', color: '#9a3412', padding: '12px 14px', borderRadius: 10, marginTop: 14, fontSize: 14, lineHeight: 1.6 }}>
                                {subMsg}
                                <div style={{ marginTop: 6 }}>앱스토어나 플레이스토어에서 결제한 구독은 휴대폰의 스토어 설정에서 해지해 주세요.</div>
                                <button type="button" disabled={busy} onClick={() => void cancelSub()} style={{
                                    ...btn, minHeight: 40, marginTop: 10, fontSize: 14, border: '1px solid #fdba74', background: '#fff', color: '#9a3412',
                                }}>웹에서 결제한 구독 해지하기</button>
                            </div>
                        )}
                        {note && <div role="status" style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary-800)', padding: '10px 14px', borderRadius: 10, marginTop: 14, fontSize: 14 }}>{note}</div>}
                        {err && <div role="alert" style={{ background: 'var(--color-red-50)', color: 'var(--color-red-700)', padding: '10px 14px', borderRadius: 10, marginTop: 14, fontSize: 14 }}>{err}</div>}

                        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                            <button type="button" onClick={close} disabled={busy} style={{ ...btn, flex: 1, border: '1px solid var(--color-neutral-200)', background: '#fff', color: 'var(--color-neutral-900)' }}>취소</button>
                            <button type="button" onClick={() => void remove()} disabled={busy || !isDeleteWordTyped(typed)} style={{
                                ...btn, flex: 1, border: 0, color: '#fff',
                                background: busy || !isDeleteWordTyped(typed) ? '#f3b4ae' : RED,
                                cursor: busy || !isDeleteWordTyped(typed) ? 'default' : 'pointer',
                            }}>{busy ? '처리 중' : '탈퇴하기'}</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
