'use client'
// 봇과 대화 (가운데 열) + 오른쪽 세부칸. 기존 /api/chat 을 그대로 쓴다 (스트림 모양 동일).
// 캐릭터 상태: 입력 중 listening → 보내면 thinking → 첫 글자 오면 talking → 끝나면 idle. 둘 다 죽으면 error.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getVisitorId } from '@/lib/visitor'
import { UNAVAILABLE_TEXT } from '@/domains/chat/constants'
import type { BotState } from '@/domains/os/types'
import { osTrack } from '@/domains/os/events'
import { readLocalIntent } from '@/domains/os/settings'
import BotAvatar from './BotAvatar'
import BotMarkdown from './BotMarkdown'
import CheckinStrip from './CheckinStrip'
import CloverBar from './CloverBar'
import DetailPane from './DetailPane'
import NextStepLink from './NextStepLink'
import AddKnowledgeSheet from './AddKnowledgeSheet'
import PermissionCard from './PermissionCard'
import type { CardView } from './PermissionCard'
import { useOsTeam } from './OsShell'
// === 사진 첨부 ===
import { usePhotoAttach, PhotoPlusMenu, PhotoStrip } from './PhotoAttach'
import PhotoGrid from './PhotoGrid'
import { photoPayload } from '@/domains/os/photos'
// === /사진 첨부 ===

interface Msg {
    id: string
    role: 'user' | 'assistant'
    content: string
    /** 이 답에 쓴 자료 (있으면 말풍선 아래 「참고한 자료」로 보인다) */
    sources?: { id: string; title: string }[]
    /** 밖으로 나가는 일이면 답 대신 승인 카드가 온다 */
    card?: CardView
    /** === 사진 첨부 === 내 말풍선에 붙인 사진들 (우리 저장소 주소, 최대 10) */
    imageUrls?: string[]
}

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
    const [detailOpen, setDetailOpen] = useState(false)   // 넓은 화면이면 켜진 채로 시작한다(아래 효과)
    const [addSheet, setAddSheet] = useState(false)
    const [demo, setDemo] = useState(false)
    const endRef = useRef<HTMLDivElement>(null)
    // === 사진 첨부 ===
    const photos = usePhotoAttach()
    const [dragging, setDragging] = useState(false)
    // === /사진 첨부 ===

    // 시연(?demo=1)·손님에게는 「내 것」을 저장하는 칸(체크인·다음 한 걸음)을 안 보인다.
    // 오른쪽 세부칸은 넓은 화면이면 열린 채, 폰이면 닫힌 채 시작한다. 그 뒤로는 ⓘ 로 사람이 정한다.
    useEffect(() => {
        void Promise.resolve().then(() => {
            setDemo(new URLSearchParams(window.location.search).get('demo') === '1')
            setDetailOpen(window.matchMedia?.('(min-width: 901px)').matches ?? true)
        })
    }, [])
    const 개인화숨김 = guest || demo

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
        // === 사진 첨부 === 사진만 보내도 된다. 올리는 중이거나 실패한 장이 남아 있으면 기다린다.
        const photoUrls = photos.urls
        if ((!text && photoUrls.length === 0) || streaming || photos.uploading || photos.failed) return
        osTrack('os_message_sent', { mentor_id: mentorId, guest, photos: photoUrls.length })
        const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', content: text, ...(photoUrls.length ? { imageUrls: photoUrls } : {}) }
        // === /사진 첨부 ===
        const botId = `a-${Date.now()}`
        const base = [...messages, userMsg]

        // 서버를 부르기 전 가벼운 규칙 2개. 내 팀 봇일 때만 본다(공개 봇에는 자료를 못 넣는다).
        // 여기서 끝나는 말은 모델을 부르지 않는다 = 클로버를 안 쓴다.
        const 눈치 = bot && !guest && text ? readLocalIntent(text) : null
        if (눈치?.kind === 'group') {
            setInput('')
            setMessages([...base, { id: botId, role: 'assistant', content: '여러 봇과 한 방에서 이야기하려면 왼쪽 위 ＋ → 그룹 채팅 만들기 로 만들 수 있어요.' }])
            setState('idle')
            return
        }
        if (눈치?.kind === 'knowledge' && bot) {
            setInput('')
            setMessages([...base, { id: botId, role: 'assistant', content: '자료에 넣었어요. 읽는 데 잠시 걸려요 📎' }])
            setState('idle')
            try {
                const res = await fetch('/api/os/knowledge', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mentorId, kind: 'url', url: 눈치.url }),
                })
                if (res.ok) osTrack('os_knowledge_added', { mentor_id: mentorId, kind: 'url' })
                else {
                    const d = await res.json().catch(() => ({}))
                    setMessages([...base, { id: botId, role: 'assistant', content: `이 링크는 못 넣었어요. ${String(d.error ?? '').slice(0, 80)}` }])
                }
            } catch {
                setMessages([...base, { id: botId, role: 'assistant', content: '이 링크는 못 넣었어요. 잠시 뒤 다시 해 주세요.' }])
            }
            return
        }
        setMessages([...base, { id: botId, role: 'assistant', content: '' }])
        setInput('')
        photos.clear()   // === 사진 첨부 === 보냈으니 띠를 비운다
        setStreaming(true)
        setState('thinking')

        try {
            const sid = await ensureSession()

            // ① 밖으로 내보내는 말인지 먼저 본다. 맞으면 봇은 답하지 않고 승인 카드가 뜬다.
            //    (보내기·게시·구매·이체·삭제는 내가 허용하기 전엔 나가지 않는다)
            if (!guest && text) {
                try {
                    const draftRes = await fetch('/api/os/chat/draft', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text, mentorId, sessionId: sid ?? undefined }),
                    })
                    const draftData = await draftRes.json()
                    if (draftData?.card) {
                        osTrack('os_approval_shown', { card_id: String(draftData.card.id ?? ''), action_type: String(draftData.card.actionType ?? '') })
                        setMessages([...base, { id: botId, role: 'assistant', content: '', card: draftData.card as CardView }])
                        setState('waiting_approval')
                        setStreaming(false)
                        return
                    }
                    if (draftData?.blocked?.message) {
                        setMessages([...base, { id: botId, role: 'assistant', content: draftData.blocked.message }])
                        setState('idle')
                        setStreaming(false)
                        return
                    }
                } catch { /* 못 물어봤으면 평소대로 대화한다 */ }
            }

            const res = await fetch('/api/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // === 사진 첨부 === 지난 메시지의 첫 장은 imageUrl 로 같이 보낸다(서버가 최근 3통 안 사진을 되짚어 본다)
                    messages: base.slice(-MAX_CONTEXT).map(m => ({ role: m.role, content: m.content, ...(m.imageUrls?.[0] ? { imageUrl: m.imageUrls[0] } : {}) })),
                    ...photoPayload(photoUrls),
                    // === /사진 첨부 ===
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
            let sources: { id: string; title: string }[] = []
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
                            // 마지막 조각에 「이 답에 쓴 자료」가 실려 온다
                            if (d.done && Array.isArray(d.sources)) sources = d.sources
                        } catch { /* 조각 하나 깨진 건 넘어간다 */ }
                    }
                }
            }
            setState(full.includes(UNAVAILABLE_TEXT) ? 'error' : 'idle')
            if (!full) setMessages([...base, { id: botId, role: 'assistant', content: UNAVAILABLE_TEXT }])
            else if (sources.length > 0) setMessages([...base, { id: botId, role: 'assistant', content: full, sources }])
        } catch {
            setState('error')
            setMessages([...base, { id: botId, role: 'assistant', content: UNAVAILABLE_TEXT }])
        } finally {
            setStreaming(false)
        }
    }, [input, streaming, messages, mentorId, guest, bot, ensureSession, photos])

    const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() }
    }

    const avatar = bot
        ? <BotAvatar shape={bot.shape} color={bot.color} state={state} size={36} faceUrl={bot.avatarUrl} name={bot.name} />
        : <BotAvatar shape="circle" color="white" state={state} size={36} faceUrl={publicBot?.avatar_url ?? null} name={publicBot?.name ?? name} />

    return (
        <div className={`os-chat-wrap${detailOpen ? '' : ' narrow'}${dragging ? ' dragging' : ''}`}
            // === 사진 첨부 === 끌어다 놓기 (사진 파일만 받는다)
            onDragOver={e => { if (Array.from(e.dataTransfer.types).includes('Files')) { e.preventDefault(); setDragging(true) } }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
            onDrop={e => { setDragging(false); if (photos.addFromData(e.dataTransfer)) e.preventDefault() }}
            // === /사진 첨부 ===
        >
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <header className="os-chat-head">
                    {avatar}
                    <span>{name}</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <button className="os-icon-btn" aria-label="세부 정보" aria-expanded={detailOpen}
                            title={detailOpen ? '세부 정보 닫기' : '세부 정보 열기'} onClick={() => setDetailOpen(v => !v)}>ⓘ</button>
                    </span>
                </header>

                {/* 오늘 체크인 띠 — 오늘 아직 안 했을 때만. 손님·시연에선 안 뜬다 */}
                <CheckinStrip hidden={개인화숨김} />

                <div className="os-messages">
                    {greeting && messages.length === 0 && (
                        <>
                            <div className="os-sender">{avatar}<span>{name}</span></div>
                            <div className="os-bubble bot">{greeting}</div>
                        </>
                    )}
                    {messages.map(m => m.role === 'user'
                        ? (m.imageUrls && m.imageUrls.length > 0
                            // === 사진 첨부 === 사진 격자 + 글
                            ? <div key={m.id} className="os-bubble me has-photos"><PhotoGrid urls={m.imageUrls} />{m.content && <div className="os-photo-text">{m.content}</div>}</div>
                            : <div key={m.id} className="os-bubble me">{m.content}</div>)
                        : (
                            <div key={m.id} style={{ display: 'contents' }}>
                                <div className="os-sender">{avatar}<span>{name}</span></div>
                                {m.card
                                    ? <PermissionCard
                                        card={m.card}
                                        onDecided={(c) => {
                                            osTrack('os_approval_decided', { card_id: c.id, action_type: c.actionType, status: c.status })
                                            setMessages(prev => prev.map(x => x.id === m.id ? { ...x, card: c } : x))
                                            setState('idle')
                                        }}
                                    />
                                    : <div className="os-bubble bot md">{m.content ? <BotMarkdown text={m.content} /> : (state === 'thinking' ? '…' : '')}</div>}
                                {m.sources && m.sources.length > 0 && (
                                    <div className="os-cite">📎 참고한 자료: {m.sources.map(s => s.title).join(' · ')}</div>
                                )}
                                {/* 답 아래 작은 링크 — 봇이 말을 다 끝낸 뒤에만 */}
                                {!m.card && !개인화숨김 && !streaming && m.content && (
                                    <NextStepLink answer={m.content} mentorId={mentorId} />
                                )}
                            </div>
                        ))}
                    <div ref={endRef} />
                </div>

                {/* 🍀 클로버 잔량 — 입력창 바로 위. 원화 환산은 안 적는다 */}
                <CloverBar guest={guest} />

                {/* === 사진 첨부 === 붙인 사진 미리보기 띠 (입력창 위) */}
                <PhotoStrip items={photos.items} notice={photos.notice} onRemove={photos.remove} onRetry={photos.retry} />
                {/* === /사진 첨부 === */}

                <div className="os-input-bar">
                    {/* === 사진 첨부 === ＋ 메뉴: 사진 붙이기 / 자료 넣기 */}
                    <PhotoPlusMenu canKnowledge={!!bot} onPickPhotos={photos.add} onKnowledge={() => setAddSheet(true)} />
                    {/* === /사진 첨부 === */}
                    <textarea
                        className="os-input"
                        rows={1}
                        value={input}
                        onChange={e => { setInput(e.target.value); if (!streaming) setState(e.target.value ? 'listening' : 'idle') }}
                        onKeyDown={onKey}
                        onPaste={e => { if (photos.addFromData(e.clipboardData)) e.preventDefault() }}   // === 사진 첨부 === 붙여넣기
                        placeholder={`${name}에게 메시지 보내기`}
                        aria-label="메시지"
                        style={{ resize: 'none' }}
                    />
                    <button className="os-icon-btn os-send" aria-label="보내기"
                        disabled={(!input.trim() && photos.urls.length === 0) || streaming || photos.uploading || photos.failed}
                        title={photos.uploading ? '사진을 올리는 중이에요' : photos.failed ? '실패한 사진을 빼거나 다시 시도해 주세요' : undefined}
                        onClick={() => void send()}>↑</button>
                </div>
            </div>

            <aside className={`os-right ${detailOpen ? 'open' : 'closed'}`}>
                <DetailPane bot={bot} publicName={publicBot?.name ?? null} />
            </aside>

            {addSheet && bot && (
                <AddKnowledgeSheet mentorId={bot.mentorId} onClose={() => setAddSheet(false)} onAdded={() => { }} />
            )}
        </div>
    )
}
