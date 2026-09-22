'use client'
// 봇과 대화 (가운데 열) + 오른쪽 세부칸. 기존 /api/chat 을 그대로 쓴다 (스트림 모양 동일).
// 캐릭터 상태: 입력 중 listening → 보내면 thinking → 첫 글자 오면 talking → 끝나면 idle. 둘 다 죽으면 error.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getVisitorId } from '@/lib/visitor'
import { UNAVAILABLE_TEXT } from '@/domains/chat/constants'
import type { BotState } from '@/domains/os/types'
import BotAvatar from './BotAvatar'
import DetailPane from './DetailPane'
import { useOsTeam } from './OsShell'

interface Msg { id: string; role: 'user' | 'assistant'; content: string }

interface PublicBot { id: string; name: string; avatar_url: string | null; greeting_message: string; title?: string }

const MAX_CONTEXT = 20

export default function OsChat({ mentorId }: { mentorId: string }) {
    const { team, loading, guest } = useOsTeam()
    const bot = useMemo(() => team.find(b => b.mentorId === mentorId) ?? null, [team, mentorId])
    const [publicBot, setPublicBot] = useState<PublicBot | null>(null)
    const [messages, setMessages] = useState<Msg[]>([])
    const [input, setInput] = useState('')
    const [state, setState] = useState<BotState>('idle')
    const [streaming, setStreaming] = useState(false)
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [detailOpen, setDetailOpen] = useState(false)
    const endRef = useRef<HTMLDivElement>(null)

    // 내 팀에 없으면 공개 봇(리더의 봇)인지 본다
    useEffect(() => {
        if (bot || loading) return
        let alive = true
        fetch(`/api/mentors/${mentorId}`).then(r => r.ok ? r.json() : null).then(d => { if (alive && d?.mentor) setPublicBot(d.mentor) }).catch(() => {})
        return () => { alive = false }
    }, [bot, loading, mentorId])

    const name = bot?.name ?? publicBot?.name ?? '봇'
    const greeting = bot?.greeting ?? publicBot?.greeting_message ?? ''

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

    const ensureSession = useCallback(async (): Promise<string | null> => {
        if (guest) return null
        if (sessionId) return sessionId
        try {
            const res = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mentorId }) })
            const d = await res.json()
            const id = d?.session?.id ?? null
            if (id) setSessionId(id)
            return id
        } catch { return null }
    }, [guest, sessionId, mentorId])

    const send = useCallback(async () => {
        const text = input.trim()
        if (!text || streaming) return
        const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', content: text }
        const botId = `a-${Date.now()}`
        const base = [...messages, userMsg]
        setMessages([...base, { id: botId, role: 'assistant', content: '' }])
        setInput('')
        setStreaming(true)
        setState('thinking')

        try {
            const sid = await ensureSession()
            const res = await fetch('/api/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: base.slice(-MAX_CONTEXT).map(m => ({ role: m.role, content: m.content })),
                    mentorId,
                    sessionId: sid ?? undefined,
                    inputMethod: 'text',
                    visitorId: guest ? getVisitorId() : undefined,
                    ...(guest ? { guestMessageCount: 0 } : {}),
                }),
            })
            if (!res.ok || !res.body) throw new Error(`chat ${res.status}`)
            const reader = res.body.getReader()
            const dec = new TextDecoder()
            let buf = ''
            let full = ''
            let first = true
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buf += dec.decode(value, { stream: true })
                const parts = buf.split('\n\n'); buf = parts.pop() || ''
                for (const part of parts) {
                    for (const line of part.split('\n')) {
                        if (!line.startsWith('data: ')) continue
                        try {
                            const d = JSON.parse(line.slice(6))
                            if (d.text) {
                                if (first) { setState('talking'); first = false }
                                full += d.text
                                const snapshot = full
                                setMessages([...base, { id: botId, role: 'assistant', content: snapshot }])
                            }
                        } catch { /* 조각 하나 깨진 건 넘어간다 */ }
                    }
                }
            }
            setState(full.includes(UNAVAILABLE_TEXT) ? 'error' : 'idle')
            if (!full) setMessages([...base, { id: botId, role: 'assistant', content: UNAVAILABLE_TEXT }])
        } catch {
            setState('error')
            setMessages([...base, { id: botId, role: 'assistant', content: UNAVAILABLE_TEXT }])
        } finally {
            setStreaming(false)
        }
    }, [input, streaming, messages, mentorId, guest, ensureSession])

    const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() }
    }

    const avatar = bot
        ? <BotAvatar shape={bot.shape} color={bot.color} state={state} size={36} faceUrl={bot.avatarUrl} />
        : <BotAvatar shape="circle" color="white" state={state} size={36} faceUrl={publicBot?.avatar_url ?? null} />

    return (
        <div className="os-chat-wrap">
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <header className="os-chat-head">
                    {avatar}
                    <span>{name}</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <button className="os-icon-btn" aria-label="세부 정보" title="세부 정보" onClick={() => setDetailOpen(v => !v)}>ⓘ</button>
                    </span>
                </header>

                <div className="os-messages">
                    {greeting && messages.length === 0 && (
                        <>
                            <div className="os-sender">{avatar}<span>{name}</span></div>
                            <div className="os-bubble bot">{greeting}</div>
                        </>
                    )}
                    {messages.map(m => m.role === 'user'
                        ? <div key={m.id} className="os-bubble me">{m.content}</div>
                        : (
                            <div key={m.id} style={{ display: 'contents' }}>
                                <div className="os-sender">{avatar}<span>{name}</span></div>
                                <div className="os-bubble bot">{m.content || (state === 'thinking' ? '…' : '')}</div>
                            </div>
                        ))}
                    <div ref={endRef} />
                </div>

                <div className="os-input-bar">
                    <button className="os-icon-btn" aria-label="붙이기" title="자료 붙이기 (3일차)">＋</button>
                    <textarea
                        className="os-input"
                        rows={1}
                        value={input}
                        onChange={e => { setInput(e.target.value); if (!streaming) setState(e.target.value ? 'listening' : 'idle') }}
                        onKeyDown={onKey}
                        placeholder={`${name}에게 메시지 보내기`}
                        aria-label="메시지"
                        style={{ resize: 'none' }}
                    />
                    <button className="os-icon-btn os-send" aria-label="보내기" disabled={!input.trim() || streaming} onClick={() => void send()}>↑</button>
                </div>
            </div>

            <aside className={`os-right${detailOpen ? ' open' : ''}`}>
                <DetailPane bot={bot} publicName={publicBot?.name ?? null} />
            </aside>
        </div>
    )
}
