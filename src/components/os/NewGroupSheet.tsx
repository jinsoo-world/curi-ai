'use client'
// 「그룹 채팅 만들기」 = ①멤버 고르기(체크) ②방 이름 ③첫 답 봇 고르기
// 첫 답 봇 = 사람이 말했을 때 제일 먼저 답하는 봇. 목록 맨 앞에 넣는다.

import { useState } from 'react'
import type { TeamBot } from '@/domains/os/types'
import BotAvatar from './BotAvatar'

interface Props {
    team: TeamBot[]
    onClose: () => void
    onCreated: (channel: { id: string; name: string }) => void | Promise<void>
}

export default function NewGroupSheet({ team, onClose, onCreated }: Props) {
    const 고를수있는봇 = team.filter(b => !b.hidden)
    const [picked, setPicked] = useState<string[]>([])
    const [first, setFirst] = useState<string>('')
    const [name, setName] = useState('내 팀')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    const 고르기 = (mentorId: string) => {
        setPicked(prev => {
            const next = prev.includes(mentorId) ? prev.filter(id => id !== mentorId) : [...prev, mentorId]
            if (!next.includes(first)) setFirst(next[0] ?? '')
            else if (!first && next.length) setFirst(next[0])
            return next
        })
    }

    const 만들기 = async () => {
        setBusy(true); setErr(null)
        try {
            // 첫 답 봇을 맨 앞에 둔다 (서버는 맨 앞 봇이 먼저 답하게 되어 있다)
            const 순서 = first ? [first, ...picked.filter(id => id !== first)] : picked
            const res = await fetch('/api/os/channels', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim() || '내 팀', mentorIds: 순서 }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '방을 만들지 못했어요')
            await onCreated(data.channel)
        } catch (e) {
            setErr(e instanceof Error ? e.message : '방을 만들지 못했어요')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="os-sheet-back" data-theme="os" onClick={busy ? undefined : onClose} role="dialog" aria-modal="true" aria-label="그룹 채팅 만들기">
            <div className="os-sheet" onClick={e => e.stopPropagation()}>
                <h3>그룹 채팅 만들기</h3>
                <div className="os-step">봇 2명 이상을 한 방에 넣어요. 내가 물으면 한 명이 답하고, 필요하면 다른 한 명을 부를 수 있어요.</div>

                {고를수있는봇.length < 2 ? (
                    <div className="os-card">봇이 2명 이상이어야 그룹을 만들 수 있어요. ＋ 로 봇을 하나 더 만들어 주세요.</div>
                ) : (
                    <>
                        <div className="os-step" style={{ marginBottom: 8 }}>누구를 넣을까요</div>
                        <div className="os-chips">
                            {고를수있는봇.map(b => (
                                <button key={b.id} className="os-chipbtn" aria-pressed={picked.includes(b.mentorId)}
                                    onClick={() => 고르기(b.mentorId)} disabled={busy}
                                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <BotAvatar shape={b.shape} color={b.color} state="sleeping" size={28} />
                                    {b.name}
                                </button>
                            ))}
                        </div>

                        <div className="os-step" style={{ margin: '16px 0 8px' }}>방 이름</div>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={40} aria-label="방 이름" disabled={busy} />

                        {picked.length >= 2 && (
                            <>
                                <div className="os-step" style={{ margin: '16px 0 8px' }}>누가 먼저 답할까요</div>
                                <div className="os-chips">
                                    {picked.map(id => {
                                        const b = 고를수있는봇.find(x => x.mentorId === id)
                                        if (!b) return null
                                        return (
                                            <button key={id} className="os-chipbtn" aria-pressed={first === id} onClick={() => setFirst(id)} disabled={busy}>
                                                {b.name}
                                            </button>
                                        )
                                    })}
                                </div>
                            </>
                        )}
                    </>
                )}

                {err && <div className="os-notice" style={{ margin: '14px 0 0' }}>{err}</div>}

                <div className="os-sheet-foot">
                    <button className="os-btn" onClick={onClose} disabled={busy}>닫기</button>
                    <button className="os-btn primary" onClick={만들기} disabled={busy || picked.length < 2}>
                        {busy ? '만드는 중…' : '방 만들기'}
                    </button>
                </div>
            </div>
        </div>
    )
}
