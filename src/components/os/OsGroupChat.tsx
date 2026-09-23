'use client'
// 그룹방 대화 - 사람이 말하면 첫 답 봇이 답하고, 그 답에 「@다른봇」이 있으면 그 봇이 한 번만 이어 답한다.
// 사람이 「@홍보팀장 …」 처럼 한 명을 콕 집으면 그 봇만 답한다.
// 봇이 한 말 위에는 「보낸 사람 ○○」(다른 봇을 부르면 「보낸 사람 ○○ → ○○」) 표식을 붙인다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOsTeam } from './OsShell'
import BotAvatar from './BotAvatar'
import BotMarkdown from './BotMarkdown'
import MenuIcon, { CloseIcon, swipeToClose } from './MenuIcon'
import { findMentionedBot, pickResponders } from '@/domains/os/channels'
import { osTrack } from '@/domains/os/events'
import type { BotColor, BotShape } from '@/domains/os/types'
import MentionPicker from './MentionPicker'
import { useMentionComposer } from './useMentionComposer'
import { MsgRow, useRevealTimestamps } from './MsgRow'
import WorkingStatusLine from './WorkingStatusLine'
import MentionRichText from './MentionRichText'
import { GROUP_THINK_MS, GROUP_GAP_MS, sleep } from '@/domains/os/group-stagger'
import OgLinkPreview, { isUrlOnlyText } from './OgLinkPreview'

interface Member { mentorId: string; name: string; shape: string; color: string; avatarUrl: string | null }
interface Msg { id: string; authorKind: 'user' | 'bot'; mentorId: string | null; content: string; createdAt?: string }

export default function OsGroupChat({ channelId }: { channelId: string }) {
    const { team, refreshChannels } = useOsTeam()
    const [name, setName] = useState('그룹')
    const [renaming, setRenaming] = useState(false)
    const [nameDraft, setNameDraft] = useState('')
    const [members, setMembers] = useState<Member[]>([])
    const [messages, setMessages] = useState<Msg[]>([])
    const [input, setInput] = useState('')
    const [busy, setBusy] = useState(false)
    /** 지금 답 준비 중인 봇 mentorId (작업 중 표지) */
    const [workingIds, setWorkingIds] = useState<string[]>([])
    const [detailOpen, setDetailOpen] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [notReady, setNotReady] = useState(false)
    const endRef = useRef<HTMLDivElement>(null)
    const reveal = useRevealTimestamps()
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const inputWrapRef = useRef<HTMLDivElement>(null)

    const mentionBots = useMemo(
        () => members.map(m => ({
            mentorId: m.mentorId, name: m.name, shape: m.shape, color: m.color, avatarUrl: m.avatarUrl,
        })),
        [members],
    )
    const chipBots = useMemo(
        () => mentionBots.map(b => ({
            mentorId: b.mentorId, name: b.name, shape: b.shape, color: b.color, avatarUrl: b.avatarUrl,
        })),
        [mentionBots],
    )
    const mention = useMentionComposer(mentionBots)

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
    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, workingIds])

    const saveName = useCallback(async () => {
        const next = nameDraft.trim().slice(0, 40) || '내 팀'
        setRenaming(false)
        if (next === name) return
        const prev = name
        setName(next)
        try {
            const res = await fetch(`/api/os/channels/${channelId}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: next }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '이름을 못 바꿨어요')
            if (data.channel?.name) setName(data.channel.name)
            await refreshChannels()
        } catch (e) {
            setName(prev)
            setErr(e instanceof Error ? e.message : '이름을 못 바꿨어요')
        }
    }, [nameDraft, name, channelId, refreshChannels])

    const send = useCallback(async () => {
        const text = input.trim()
        if (!text || busy) return
        setInput(''); setBusy(true); setErr(null)
        osTrack('os_group_message', { channel_id: channelId, members: members.length })
        const userMsg = { id: `tmp-${Date.now()}`, authorKind: 'user' as const, mentorId: null, content: text, createdAt: new Date().toISOString() }
        setMessages(prev => [...prev, userMsg])
        // 서버와 같은 규칙으로 누가 답할지. @한 명이면 그 봇만 (간격 없음)
        const upcoming = pickResponders(text, members.map(m => ({ mentorId: m.mentorId, name: m.name })))
        // 기다리는 동안에는 첫 봇만 「생각 중」으로 보여 동시 폭주를 피한다
        setWorkingIds(upcoming[0] ? [upcoming[0].mentorId] : [])
        try {
            const res = await fetch(`/api/os/channels/${channelId}/chat`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '말을 못 옮겼어요')
            const botMsgs = (Array.isArray(data.messages) ? data.messages : []).filter(
                (m: { authorKind?: string }) => m.authorKind === 'bot',
            ) as Msg[]
            // 답을 한 봇씩: 생각 중 → 말풍선 (여러 명이면 짧은 간격). @한 명이면 한 번만
            if (botMsgs.length === 0) {
                await load()
            } else {
                for (let i = 0; i < botMsgs.length; i++) {
                    const msg = botMsgs[i]!
                    setWorkingIds(msg.mentorId ? [msg.mentorId] : [])
                    await sleep(GROUP_THINK_MS)
                    setWorkingIds([])
                    setMessages(prev => {
                        // 같은 id 가 이미 있으면 덮지 않는다
                        if (prev.some(x => x.id === msg.id)) return prev
                        return [...prev, msg]
                    })
                    if (i < botMsgs.length - 1) await sleep(GROUP_GAP_MS)
                }
                // id 시각을 서버와 맞춘다 (이미 보이는 말은 유지)
                await load()
            }
        } catch (e) {
            setErr(e instanceof Error ? e.message : '말을 못 옮겼어요')
            setWorkingIds([])
        } finally {
            setWorkingIds([])
            setBusy(false)
        }
    }, [input, busy, channelId, load, members])

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
                    <span className="os-chat-head-name">
                        {renaming ? (
                            <input
                                className="os-group-name-input"
                                value={nameDraft}
                                maxLength={40}
                                aria-label="방 이름"
                                autoFocus
                                onChange={e => setNameDraft(e.target.value)}
                                onBlur={() => { void saveName() }}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') { e.preventDefault(); void saveName() }
                                    if (e.key === 'Escape') { setRenaming(false); setNameDraft(name) }
                                }}
                            />
                        ) : (
                            <>
                                <span>{name}</span>
                                <button
                                    type="button"
                                    aria-label="방 이름 바꾸기"
                                    title="이름 바꾸기"
                                    onClick={() => { setNameDraft(name); setRenaming(true) }}
                                >이름</button>
                            </>
                        )}
                    </span>
                    <span style={{ marginLeft: 'auto' }}>
                        <button className="os-icon-btn os-menu" aria-label="멤버 보기" aria-expanded={detailOpen} title="멤버" onClick={() => setDetailOpen(v => !v)}><MenuIcon /></button>
                    </span>
                </header>

                <div className={`os-messages${reveal.className ? ` ${reveal.className}` : ''}`} ref={reveal.ref} style={reveal.style}>
                    {messages.length === 0 && (
                        <MsgRow side="bot">
                            <div className="os-bubble bot">여기서는 봇 여러 명이 같이 들어요. 방 전체에 말하면 진행 봇이 짧게 받은 뒤 멤버들이 차례로 답해요. 한 명만 부르려면 「@이름」으로 시작하세요.</div>
                        </MsgRow>
                    )}
                    {messages.map(m => m.authorKind === 'user'
                        ? (
                            <MsgRow key={m.id} side="me" createdAt={m.createdAt}>
                                {!isUrlOnlyText(m.content) && <div className="os-bubble me"><MentionRichText text={m.content} bots={chipBots} /></div>}
                                <OgLinkPreview text={m.content} className="os-og-cards--me" />
                            </MsgRow>
                        )
                        : (
                            <MsgRow key={m.id} side="bot" createdAt={m.createdAt}>
                                <div className="os-sender">{아바타(m.mentorId)}<span>{보낸사람(m)}</span></div>
                                {!isUrlOnlyText(m.content) && <div className="os-bubble bot md"><MentionRichText text={m.content} bots={chipBots} markdown /></div>}
                                <OgLinkPreview text={m.content} />
                            </MsgRow>
                        ))}
                    {workingIds.map(id => {
                        const m = members.find(x => x.mentorId === id)
                        if (!m) return null
                        return (
                            <MsgRow key={`work-${id}`} side="bot">
                                <WorkingStatusLine botName={m.name} avatar={아바타(id, 22)} />
                            </MsgRow>
                        )
                    })}
                    <div ref={endRef} />
                </div>

                {err && <div className="os-notice">{err}</div>}

                <div className="os-input-bar">
                    <div className="os-input-wrap" ref={inputWrapRef}>
                        {mention.open && (
                            <MentionPicker
                                items={mention.items}
                                activeIndex={mention.activeIndex}
                                onHover={mention.setActiveIndex}
                                onSelect={(item) => {
                                    const el = inputRef.current
                                    const cursor = el?.selectionStart ?? input.length
                                    const next = mention.insert(input, cursor, item)
                                    setInput(next.text)
                                    requestAnimationFrame(() => {
                                        const ta = inputRef.current
                                        if (!ta) return
                                        ta.focus()
                                        ta.setSelectionRange(next.cursor, next.cursor)
                                    })
                                }}
                                onClose={mention.close}
                                anchorRef={inputWrapRef}
                                showPluginStub
                                emptyQuery={!mention.query}
                            />
                        )}
                        <div className="os-input-chip-host">
                        <div className="os-input-chip-mirror" aria-hidden>
                            {input ? <MentionRichText text={input} bots={chipBots} /> : null}
                        </div>
                        <textarea
                            ref={inputRef}
                            className="os-input os-input--ghost"
                            rows={1}
                            spellCheck={false}
                            value={input}
                            onChange={e => {
                                const v = e.target.value
                                setInput(v)
                                mention.syncAfterChange(v, e.target.selectionStart ?? v.length, inputRef)
                            }}
                            onClick={e => mention.syncFromInput(input, e.currentTarget.selectionStart ?? input.length)}
                            onKeyUp={e => {
                                if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                                    mention.syncFromInput(input, e.currentTarget.selectionStart ?? input.length)
                                }
                            }}
                            onKeyDown={e => {
                                const keyResult = mention.onKeyWhileOpen(e)
                                if (keyResult === 'handled') return
                                if (keyResult === 'select' && mention.activeItem) {
                                    e.preventDefault()
                                    const item = mention.activeItem
                                    const el = inputRef.current
                                    const cursor = el?.selectionStart ?? input.length
                                    const next = mention.insert(input, cursor, item)
                                    setInput(next.text)
                                    requestAnimationFrame(() => {
                                        const ta = inputRef.current
                                        if (!ta) return
                                        ta.focus()
                                        ta.setSelectionRange(next.cursor, next.cursor)
                                    })
                                    return
                                }
                                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                    e.preventDefault()
                                    void send()
                                }
                            }}
                            placeholder={`${name}에 메시지 보내기 (@이름으로 한 명만)`}
                            aria-label="메시지"
                            aria-autocomplete="list"
                            aria-expanded={mention.open}
                            style={{ resize: 'none' }}
                        />
                        </div>
                    </div>
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
                        {i === 0 && <span className="os-source-state ok">진행</span>}
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
