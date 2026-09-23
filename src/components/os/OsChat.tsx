'use client'
// 봇과 대화 (가운데 열) + 오른쪽 세부칸. 기존 /api/chat 을 그대로 쓴다 (스트림 모양 동일).
// 캐릭터 상태: 입력 중 listening → 보내면 thinking → 첫 글자 오면 talking → 끝나면 idle. 둘 다 죽으면 error.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types'
import { getVisitorId } from '@/lib/visitor'
import { UNAVAILABLE_TEXT } from '@/domains/chat/constants'
import type { BotState } from '@/domains/os/types'
import { osTrack } from '@/domains/os/events'
import { readLocalIntent } from '@/domains/os/settings'
import { readChatCache, writeChatCache } from '@/domains/os/chat-cache'
import BotAvatar from './BotAvatar'
import BotMarkdown from './BotMarkdown'
import MenuIcon, { CloseIcon, swipeToClose } from './MenuIcon'
import PermissionCard from './PermissionCard'
import type { CardView } from './PermissionCard'
import { useOsTeam } from './OsShell'
// === 전달(relay) ===
import { readRelayIntent } from '@/domains/agent/relay'
import RelayBubble from './RelayBubble'
import type { RelayView } from './RelayBubble'
// === /전달(relay) ===
// === 사진 첨부 ===
import { usePhotoAttach, PhotoPlusMenu, PhotoStrip } from './PhotoAttach'
import PhotoGrid from './PhotoGrid'
import { photoPayload } from '@/domains/os/photos'
// === /사진 첨부 ===

// 세부칸, 자료 넣기 시트는 열 때만 내려받는다 (봇을 갈아탈 때 실을 것이 줄어든다)
const DetailPane = dynamic(() => import('./DetailPane'), { ssr: false })
const AddKnowledgeSheet = dynamic(() => import('./AddKnowledgeSheet'), { ssr: false })

interface Msg {
    id: string
    role: 'user' | 'assistant'
    content: string
    /** 이 답에 쓴 자료 (있으면 말풍선 아래 「참고한 자료」로 보인다) */
    sources?: { id: string; title: string }[]
    /** 밖으로 나가는 일이면 답 대신 승인 카드가 온다 */
    card?: CardView
    // === 전달(relay) === 옆 봇이 대신 답한 말이면 「보낸 사람 ○○ → ○○」 표식을 단다
    relay?: RelayView
    // === /전달(relay) ===
    /** === 사진 첨부 === 내 말풍선에 붙인 사진들 (우리 저장소 주소, 최대 10) */
    imageUrls?: string[]
}

interface PublicBot { id: string; name: string; avatar_url: string | null; greeting_message: string; title?: string }

const MAX_CONTEXT = 20

export default function OsChat({ mentorId }: { mentorId: string }) {
    const { team, loading, guest, openNewGroup } = useOsTeam()
    const router = useRouter()
    const bot = useMemo(() => team.find(b => b.mentorId === mentorId) ?? null, [team, mentorId])
    const [publicBot, setPublicBot] = useState<PublicBot | null>(null)
    const [messages, setMessages] = useState<Msg[]>([])
    const [input, setInput] = useState('')
    const [state, setState] = useState<BotState>('idle')
    const [streaming, setStreaming] = useState(false)
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [detailOpen, setDetailOpen] = useState(false)   // 항상 닫힌 채 시작. 열 때만 세부칸을 그린다(대표 0923 「닫힌 채로, 열 때 로딩」)
    const [addSheet, setAddSheet] = useState(false)
    const [demo, setDemo] = useState(false)
    const endRef = useRef<HTMLDivElement>(null)
    const cacheLoaded = useRef(false)   // 되살리기 전에 빈 목록을 저장해 지워 버리는 일을 막는다
    // === 사진 첨부 ===
    const photos = usePhotoAttach()
    const [dragging, setDragging] = useState(false)
    // === /사진 첨부 ===

    // 시연(?demo=1) 표식 + 이 봇과 아까 나눈 대화(탭 저장소)를 되살린다. 서버는 부르지 않는다 = 두 번째 방문은 바로 그 자리.
    useEffect(() => {
        void Promise.resolve().then(() => {
            setDemo(new URLSearchParams(window.location.search).get('demo') === '1')
            const cached = readChatCache<Msg>(window.sessionStorage, mentorId)
            if (cached) { setMessages(cached.messages); setSessionId(cached.sessionId) }
            cacheLoaded.current = true
        })
    }, [mentorId])

    // 말이 오갈 때마다(답이 다 온 뒤) 탭 저장소에 최근 50개를 남긴다. 되살리기 전(첫 그림)에는 쓰지 않는다
    useEffect(() => {
        if (streaming || !cacheLoaded.current) return
        writeChatCache(window.sessionStorage, mentorId, { sessionId, messages })
    }, [messages, sessionId, streaming, mentorId])

    // 옆 봇들의 화면을 미리 받아 둔다. 봇을 누르면 서버를 안 기다리고 바로 바뀐다(느렸던 원인 = 클릭마다 서버 왕복 1번).
    useEffect(() => {
        if (loading) return
        for (const b of team) {
            if (b.hidden || b.mentorId === mentorId) continue
            router.prefetch(`/os/chat/${b.mentorId}${demo ? '?demo=1' : ''}`, { kind: PrefetchKind.FULL })
        }
    }, [team, loading, mentorId, demo, router])

    // 세부칸이 열려 있으면 Esc 로 닫는다
    useEffect(() => {
        if (!detailOpen) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetailOpen(false) }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [detailOpen])

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

        // === 전달(relay) === 옆 봇에게 옮겨 달라는 말이면 여기서 끝낸다 (모델 안 부름 = 클로버 안 씀)
        const 전달 = bot && !guest
            ? readRelayIntent(text, team.filter(b => !b.hidden).map(b => ({ mentorId: b.mentorId, name: b.name })), mentorId)
            : null
        if (전달) {
            setInput('')
            setMessages([...base, { id: botId, role: 'assistant', content: `${전달.name}에게 옮기는 중이에요…` }])
            setState('working')
            try {
                const sid = await ensureSession()
                const res = await fetch('/api/os/relay', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, fromMentorId: mentorId, fromSessionId: sid ?? undefined }),
                })
                const d = await res.json()
                if (d?.relayed) {
                    osTrack('os_relay_sent', { from_mentor_id: mentorId, to_mentor_id: String(d.to?.mentorId ?? '') })
                    setMessages([...base, {
                        id: botId, role: 'assistant', content: String(d.answer ?? ''),
                        relay: {
                            fromName: String(d.from?.name ?? name), toName: String(d.to?.name ?? 전달.name),
                            shape: (d.to?.shape ?? 'circle') as RelayView['shape'],
                            color: (d.to?.color ?? 'white') as RelayView['color'],
                            avatarUrl: d.to?.avatarUrl ?? null,
                        },
                    }])
                    setState('idle')
                    return
                }
                // 못 옮겼으면(로그인 전, 표 없음, 밖으로 나가는 말) 조용히 평소 대화로 내려간다.
                // needsApproval 이면 아래 승인 카드 길이 그 말을 받는다.
                setMessages([...base, { id: botId, role: 'assistant', content: '' }])
            } catch {
                setMessages([...base, { id: botId, role: 'assistant', content: '' }])
            }
        }
        // === /전달(relay) ===

        // 서버를 부르기 전 가벼운 규칙 2개. 내 팀 봇일 때만 본다(공개 봇에는 자료를 못 넣는다).
        // 여기서 끝나는 말은 모델을 부르지 않는다 = 클로버를 안 쓴다.
        const 눈치 = bot && !guest && !전달 && text ? readLocalIntent(text) : null
        if (눈치?.kind === 'group') {
            // === 전달(relay) === 안내만 하지 않고 「그룹 채팅 만들기」 창을 바로 연다
            setInput('')
            setMessages([...base, { id: botId, role: 'assistant', content: '여러 봇과 한 방에서 이야기하는 창을 열었어요. 넣을 봇을 골라 주세요.' }])
            setState('idle')
            openNewGroup()
            return
            // === /전달(relay) ===
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
            //    (보내기, 게시, 구매, 이체, 삭제는 내가 허용하기 전엔 나가지 않는다)
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
        // === 전달(relay), 사진 첨부 === team, openNewGroup, name, photos 가 더 들어간다
    }, [input, streaming, messages, mentorId, guest, bot, ensureSession, team, openNewGroup, name, photos])

    const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send() }
    }

    const avatar = bot
        ? <BotAvatar shape={bot.shape} color={bot.color} state={state} size={36} faceUrl={bot.avatarUrl} name={bot.name} />
        : <BotAvatar shape="circle" color="white" state={state} size={36} faceUrl={publicBot?.avatar_url ?? null} name={publicBot?.name ?? name} />

    return (
        <div className={`os-chat-wrap${dragging ? ' dragging' : ''}`}
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
                        <button className="os-icon-btn os-menu" aria-label="세부 정보 열기" aria-expanded={detailOpen}
                            title="세부 정보 열기" onClick={() => setDetailOpen(v => !v)}><MenuIcon /></button>
                    </span>
                </header>

                {/* 오늘 체크인 띠 — 오늘 아직 안 했을 때만. 손님, 시연에선 안 뜬다 */}

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
                        // === 전달(relay) === 옆 봇이 대신 답한 말은 그 봇 얼굴, 이름으로 그린다
                        : m.relay
                            ? <div key={m.id} style={{ display: 'contents' }}><RelayBubble view={m.relay} answer={m.content} /></div>
                        // === /전달(relay) ===
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
                                    <div className="os-cite">📎 참고한 자료: {m.sources.map(s => s.title).join(', ')}</div>
                                )}
                            </div>
                        ))}
                    <div ref={endRef} />
                </div>

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

            {/* 오른쪽 세부칸 = 대화 위에 겹치는 서랍. 대화 폭은 그대로라 말풍선이 다시 줄 서지 않는다.
                폰에선 88% 폭 + 어두운 배경(누르면 닫힘). 안의 내용은 열 때만 만든다(닫혀 있으면 자료, 루틴 요청 0건) */}
            {detailOpen && <div className="os-right-back" onClick={() => setDetailOpen(false)} aria-hidden />}
            <aside className={`os-right${detailOpen ? ' open' : ''}`} aria-hidden={!detailOpen} {...swipeToClose(() => setDetailOpen(false))}>
                {/* 닫는 길 4개 = 이 ✕, 어두운 배경 탭, 오른쪽으로 쓸기, Esc (폰 실측 「열리면 안 닫힌다」 0923) */}
                <div className="os-right-head">
                    <span>세부 정보</span>
                    <button className="os-icon-btn os-right-close" aria-label="닫기" title="닫기" tabIndex={detailOpen ? 0 : -1}
                        onClick={() => setDetailOpen(false)}><CloseIcon /></button>
                </div>
                {detailOpen && <DetailPane bot={bot} publicName={publicBot?.name ?? null} />}
            </aside>

            {addSheet && bot && (
                <AddKnowledgeSheet mentorId={bot.mentorId} onClose={() => setAddSheet(false)} onAdded={() => { }} />
            )}
        </div>
    )
}
