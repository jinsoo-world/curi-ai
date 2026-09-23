'use client'
// 봇 상세의 「내 팀에 추가」 / 「팀에서 빼기」 단추 + 「N명이 팀에 넣었어요」 배지.
// 눌러도 화면을 떠나지 않는다. 성공하면 숫자와 단추 글이 바로 바뀐다.

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
    mentorId: string
    initialInTeam: boolean
    initialCount: number
    guest: boolean
    /** 내가 만든 봇이면 「팀에 넣기」는 무료. 문구가 다르다 */
    isOwner: boolean
}

export default function LinkToTeamButton({ mentorId, initialInTeam, initialCount, guest, isOwner }: Props) {
    const router = useRouter()
    const [inTeam, setInTeam] = useState(initialInTeam)
    const [count, setCount] = useState(initialCount)
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState<string | null>(null)

    async function link() {
        if (guest) { router.push(`/login?next=/mentors/${mentorId}`); return }
        setBusy(true); setNote(null)
        try {
            const r = await fetch('/api/os/team/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mentorId }) })
            const d = await r.json().catch(() => ({})) as { status?: string; linkCount?: number; message?: string; error?: string }
            if (!r.ok) { setNote(d.error ?? '팀에 넣지 못했어요'); return }
            setInTeam(true)
            if (typeof d.linkCount === 'number') setCount(d.linkCount)
            setNote(d.message ?? '내 팀에 넣었어요.')
        } catch { setNote('연결이 잠깐 끊겼어요. 다시 눌러 주세요.') }
        finally { setBusy(false) }
    }

    async function unlink() {
        setBusy(true); setNote(null)
        try {
            const r = await fetch('/api/os/team/link', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mentorId }) })
            const d = await r.json().catch(() => ({})) as { linkCount?: number; message?: string; error?: string }
            if (!r.ok) { setNote(d.error ?? '빼지 못했어요'); return }
            setInTeam(false)
            if (typeof d.linkCount === 'number') setCount(d.linkCount)
            setNote(d.message ?? '팀에서 뺐어요.')
        } catch { setNote('연결이 잠깐 끊겼어요. 다시 눌러 주세요.') }
        finally { setBusy(false) }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--먹연)' }}>
                <span aria-hidden>👥</span>
                <span>{count > 0 ? `${count}명이 팀에 넣었어요` : '아직 팀에 넣은 사람이 없어요. 첫 번째가 되어 보세요'}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {inTeam ? (
                    <button type="button" onClick={unlink} disabled={busy} style={btnGhost}>
                        {busy ? '잠시만요' : '팀에서 빼기'}
                    </button>
                ) : (
                    <button type="button" onClick={link} disabled={busy} style={btnPrimary}>
                        {busy ? '잠시만요' : isOwner ? '내 팀에 넣기 (내 봇, 무료)' : '내 팀에 추가'}
                    </button>
                )}
            </div>
            {!inTeam && !isOwner && (
                <p style={{ fontSize: 13, color: 'var(--먹연)', margin: 0, lineHeight: 1.5 }}>
                    팀에 넣으면 내 봇 화면 격자에서 바로 부를 수 있어요. 대화 요금(클로버)은 이 봇의 마켓 규칙 그대로예요.
                </p>
            )}
            {note && <p role="status" style={{ fontSize: 14, color: 'var(--먹)', margin: 0 }}>{note}</p>}
        </div>
    )
}

const btnPrimary: React.CSSProperties = {
    minHeight: 48, padding: '12px 20px', borderRadius: 14, border: 0, cursor: 'pointer',
    background: 'var(--먹)', color: '#FFFFFF', fontSize: 16, fontWeight: 700,
}
const btnGhost: React.CSSProperties = {
    minHeight: 48, padding: '12px 20px', borderRadius: 14, cursor: 'pointer',
    background: '#FFFFFF', color: 'var(--먹)', border: '1px solid var(--선)', fontSize: 16, fontWeight: 600,
}
