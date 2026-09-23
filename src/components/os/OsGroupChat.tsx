'use client'
// 그룹방 대화 — 사람이 말하면 첫 답 봇이 답하고, 그 답에 「@다른봇」이 있으면 그 봇이 한 번만 이어 답한다.
// 사람이 「@홍보팀장 …」 처럼 한 명을 콕 집으면 그 봇만 답한다.
// 봇이 한 말 위에는 「보낸 사람 ○○」(다른 봇을 부르면 「보낸 사람 ○○ → ○○」) 표식을 붙인다.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useOsTeam } from './OsShell'
import BotAvatar from './BotAvatar'
import BotMarkdown from './BotMarkdown'
import MenuIcon, { CloseIcon, swipeToClose } from './MenuIcon'
import { findMentionedBot } from '@/domains/os/channels'
import { osTrack } from '@/domains/os/events'
import type { BotColor, BotShape } from '@/domains/os/types'

interface Member { mentorId: string; name: string; shape: string; color: string; avatarUrl: string | null }
interface Msg { id: string; authorKind: 'user' | 'bot'; mentorId: string | null; content: string }

export default function OsGroupChat({ channelId }: { channelId: string }) {
    const { team, refreshChannels } = useOsTeam()
    const [name, setName] = useState('그룹')
    const [members, setMembers] = useState<Member[]>([])
    const [messages, setMessages] = useState<Msg[]>([])
    const [input, setInput] = useState('')
    const [busy, setBusy] = useState(false)
    const [detailOpen, setDetailOpen] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [notReady, setNotReady] = useState(false)
    const endRef = useRef<HTMLDivElement>(null)

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/os/channels/${channelId}`, { cache: 'no-store' })
            if (res.status === 503) { setNotReady(true); return }
            const data = await res.json()
            if (!res.ok) { setErr(data.error || '방을 못 불러왔어요'); return }
            setName(data.channel?.name ?? '그룹')
            setMembers(data.members ?? [])
            setMessages(data.messages ?? [])
        } catch { setErr('방을 못 불러왔어요') }
    }, [channelId])

    useEffect(() => { void load() }, [load])
    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

    const send = useCallback(async () => {
        const text = input.trim()
        if (!text || busy) return
        setInput(''); setBusy(true); setErr(null)
        osTrack('os_group_message', { channel_id: channelId, members: members.length })
        setMessages(prev => [...prev, { id: `tmp-${Date.now()}`, authorKind: 'user', mentorId: null, content: text }])
        try {
            const res = await fetch(`/api/os/channels/${channelId}/chat`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '말을 못 옮겼어요')
            await load()
        } catch (e) {
            setErr(e instanceof Error ? e.message : '말을 못 옮겼어요')
        } finally { setBusy(false) }
    }, [input, busy, channelId, load, members.length])

    const 멤버추가 = async (mentorId: string) => {
        const res = await fetch(`/api/os/channels/${channelId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addMentorIds: [mentorId] }),
        })
        const data = await res.json()
        if (!res.ok) { setErr(data.error || '못 넣었어요'); return }
        setMembers(data.members ?? [])
        await refreshChannels()
    }

    const 아바타 = (mentorId: string | null, size = 28) => {
        const m = members.find(x => x.mentorId === mentorId)
        return <BotAvatar shape={(m?.shape ?? 'circle') as BotShape} color={(m?.color ?? 'white') as BotColor}
            state={busy ? 'thinking' : 'idle'} size={size} faceUrl={m?.avatarUrl ?? null} />
    }
    const 이름 = (mentorId: string | null) => members.find(x => x.mentorId === mentorId)?.name ?? '봇'

    /** 이 말이 다른 봇을 「@이름」으로 부르면 「보낸 사람 A → B」로 보인다 */
    const 보낸사람 = (m: Msg) => {
        const 부른 = findMentionedBot(m.content, members.map(x => ({ mentorId: x.mentorId, name: x.name })), m.mentorId)
        return 부른 ? `보낸 사람 ${이름(m.mentorId)} → ${부른.name}` : `보낸 사람 ${이름(m.mentorId)}`
    }

    const 멤버빼기 = async (mentorId: string) => {
        const res = await fetch(`/api/os/channels/${channelId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeMentorIds: [mentorId] }),
        })
        const data = await res.json()
        if (!res.ok) { setErr(data.error || '못 뺐어요'); return }
        setMembers(data.members ?? [])
        await refreshChannels()
    }

    if (notReady) {
        return <div className="os-empty">그룹 채팅 표가 아직 준비 중이에요.<br />관리자가 표를 적용하면 바로 쓸 수 있어요.</div>
    }

    const 안들어간봇 = team.filter(b => !b.hidden && !members.some(m => m.mentorId === b.mentorId))

    return (
        <div className="os-chat-wrap">
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <header className="os-chat-head">
                    <span className="os-stack" aria-hidden>
                        {members.slice(0, 3).map(m => (
                            <span key={m.mentorId} className="os-stack-item">
                                <BotAvatar shape={m.shape as BotShape} color={m.color as BotColor} state="idle" size={28} faceUrl={m.avatarUrl} />
                            </span>
                        ))}
                        {members.length > 3 && <span className="os-stack-more">+{members.length - 3}</span>}
                    </span>
                    <span>{name}</span>
                    <span style={{ marginLeft: 'auto' }}>
                        <button className="os-icon-btn os-menu" aria-label="멤버 보기" aria-expanded={detailOpen} title="멤버" onClick={() => setDetailOpen(v => !v)}><MenuIcon /></button>
                    </span>
                </header>

                <div className="os-messages">
                    {messages.length === 0 && (
                        <div className="os-bubble bot">여기서는 봇 여러 명이 같이 들어요. 물어보시면 한 명이 답하고, 자기 몫이 아니면 다른 한 명을 부를 수 있어요. 한 명만 부르려면 「@이름」으로 시작하세요.</div>
                    )}
                    {messages.map(m => m.authorKind === 'user'
                        ? <div key={m.id} className="os-bubble me">{m.content}</div>
                        : (
                            <div key={m.id} style={{ display: 'contents' }}>
                                <div className="os-sender">{아바타(m.mentorId)}<span>{보낸사람(m)}</span></div>
                                <div className="os-bubble bot md"><BotMarkdown text={m.content} /></div>
                            </div>
                        ))}
                    {busy && <div className="os-bubble bot">…</div>}
                    <div ref={endRef} />
                </div>

                {err && <div className="os-notice">{err}</div>}

                <div className="os-input-bar">
                    <textarea className="os-input" rows={1} value={input} onChange={e => setInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }}
                        placeholder={`${name}에 메시지 보내기 (한 명만 부르려면 @이름)`} aria-label="메시지" style={{ resize: 'none' }} />
                    <button className="os-icon-btn os-send" aria-label="보내기" disabled={!input.trim() || busy} onClick={() => void send()}>↑</button>
                </div>
            </div>

            {/* 멤버 칸 = 대화 위에 겹치는 서랍 (OsChat 과 같은 모양). 폰에선 88% 폭 + 어두운 배경 */}
            {detailOpen && <div className="os-right-back" onClick={() => setDetailOpen(false)} aria-hidden />}
            <aside className={`os-right${detailOpen ? ' open' : ''}`} aria-hidden={!detailOpen} {...swipeToClose(() => setDetailOpen(false))}>
                <div className="os-right-head">
                    <span>멤버</span>
                    <button className="os-icon-btn os-right-close" aria-label="닫기" title="닫기" tabIndex={detailOpen ? 0 : -1}
                        onClick={() => setDetailOpen(false)}><CloseIcon /></button>
                </div>
                {detailOpen && <>
                <h4>멤버 ({members.length}명)</h4>
                {members.map((m, i) => (
                    <div key={m.mentorId} className="os-source">
                        <span className="os-source-kind">{아바타(m.mentorId, 24)}</span>
                        <span className="os-source-title">{m.name}</span>
                        {i === 0 && <span className="os-source-state ok">먼저 답해요</span>}
                        {members.length > 2 && (
                            <button className="os-btn" style={{ marginLeft: 'auto', padding: '2px 8px' }}
                                aria-label={`${m.name} 빼기`} onClick={() => void 멤버빼기(m.mentorId)}>빼기</button>
                        )}
                    </div>
                ))}

                <h4>멤버 추가</h4>
                {안들어간봇.length === 0
                    ? <div className="os-card">넣을 수 있는 봇이 더 없어요.</div>
                    : 안들어간봇.map(b => (
                        <button key={b.id} className="os-btn" style={{ width: '100%', marginBottom: 6 }} onClick={() => void 멤버추가(b.mentorId)}>
                            ＋ {b.name}
                        </button>
                    ))}
                </>}
            </aside>
        </div>
    )
}
