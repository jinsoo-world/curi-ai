'use client'
// 마켓 소개 화면의 「팀에 추가」 + 「대화하기」.
// 팀에 넣은 뒤에는 왼쪽 명단을 바로 고치고(/api/os/team 다시 읽기), 대화로 보낼 수 있다.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useOsTeam } from '@/components/os/OsShell'

interface Props {
    mentorId: string
    mentorName: string
    initialInTeam: boolean
    initialCount: number
    guest: boolean
    isOwner: boolean
    chatHref: string
}

export default function MarketTeamActions({
    mentorId, mentorName, initialInTeam, initialCount, guest, isOwner, chatHref,
}: Props) {
    const router = useRouter()
    const { refresh } = useOsTeam()
    const [inTeam, setInTeam] = useState(initialInTeam)
    const [count, setCount] = useState(initialCount)
    const [busy, setBusy] = useState(false)
    const [note, setNote] = useState<string | null>(null)

    async function link() {
        if (guest) {
            router.push(`/login?next=${encodeURIComponent(`/os/market/${mentorId}`)}`)
            return
        }
        setBusy(true)
        setNote(null)
        try {
            const r = await fetch('/api/os/team/link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId }),
            })
            const d = await r.json().catch(() => ({})) as {
                status?: string; linkCount?: number; message?: string; error?: string
            }
            if (!r.ok) { setNote(d.error ?? '팀에 넣지 못했어요'); return }
            setInTeam(true)
            if (typeof d.linkCount === 'number') setCount(d.linkCount)
            setNote(d.message ?? `${mentorName}을(를) 내 팀에 넣었어요.`)
            await refresh()
        } catch {
            setNote('연결이 잠깐 끊겼어요. 다시 눌러 주세요.')
        } finally {
            setBusy(false)
        }
    }

    async function unlink() {
        setBusy(true)
        setNote(null)
        try {
            const r = await fetch('/api/os/team/link', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId }),
            })
            const d = await r.json().catch(() => ({})) as { linkCount?: number; message?: string; error?: string }
            if (!r.ok) { setNote(d.error ?? '빼지 못했어요'); return }
            setInTeam(false)
            if (typeof d.linkCount === 'number') setCount(d.linkCount)
            setNote(d.message ?? '팀에서 뺐어요.')
            await refresh()
        } catch {
            setNote('연결이 잠깐 끊겼어요. 다시 눌러 주세요.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="os-market-actions">
            <div className="os-market-actions-count">
                <span aria-hidden>👥</span>
                <span>{count > 0 ? `${count}명이 팀에 넣었어요` : '아직 팀에 넣은 사람이 없어요. 첫 번째가 되어 보세요'}</span>
            </div>
            <div className="os-market-actions-row">
                <Link href={chatHref} className="os-btn primary" style={{ textDecoration: 'none', display: 'inline-grid', placeItems: 'center' }}>
                    대화하기
                </Link>
                {inTeam ? (
                    <button type="button" className="os-btn" onClick={() => void unlink()} disabled={busy}>
                        {busy ? '잠시만요' : '팀에서 빼기'}
                    </button>
                ) : (
                    <button type="button" className="os-btn" onClick={() => void link()} disabled={busy}>
                        {busy ? '잠시만요' : isOwner ? '내 팀에 넣기 (내 봇, 무료)' : '내 팀에 추가'}
                    </button>
                )}
            </div>
            {!inTeam && !isOwner && (
                <p className="os-market-actions-hint">
                    팀에 넣으면 왼쪽 명단에서 바로 부를 수 있어요. 대화 요금(클로버)은 이 봇의 마켓 규칙 그대로예요.
                </p>
            )}
            {note && <p role="status" className="os-market-actions-note">{note}</p>}
        </div>
    )
}
