'use client'
// 봇과 대화 (가운데 열) + 오른쪽 세부칸. 기존 /api/chat 을 그대로 쓴다 (스트림 모양 동일).
// 캐릭터 상태: 입력 중 listening → 보내면 thinking → 첫 글자 오면 talking → 끝나면 idle. 둘 다 죽으면 error.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types'
import { getVisitorId } from '@/lib/visitor'
import { UNAVAILABLE_TEXT } from '@/domains/chat/constants'
import type { BotState } from '@/domains/os/types'
import { osTrack } from '@/domains/os/events'
import { readLocalIntent } from '@/domains/os/settings'
import { readChatCache, writeChatCache, clearChatCache } from '@/domains/os/chat-cache'
import BotAvatar from './BotAvatar'
import BotMarkdown from './BotMarkdown'
import MenuIcon, { CloseIcon, swipeToClose } from './MenuIcon'
import PermissionCard from './PermissionCard'
import type { CardView } from './PermissionCard'
import LinkCards, { extractUrls } from './LinkCards'
import type { ReadUrlItem } from './LinkCards'
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
import { MsgRow, useRevealTimestamps } from './MsgRow'
import WorkingStatusLine from './WorkingStatusLine'
import OgLinkPreview, { isUrlOnlyText } from './OgLinkPreview'
// === @ 멘션 ===
import MentionPicker from './MentionPicker'
import { useMentionComposer } from './useMentionComposer'
import MentionRichText from './MentionRichText'
import {
    decidePersonalMentionRoute,
    emitBotCall,
    handoffAckLine,
} from '@/domains/os/mentions'
// === /@ 멘션 ===

// 세부칸, 자료 넣기 시트는 열 때만 내려받는다 (봇을 갈아탈 때 실을 것이 줄어든다)
const DetailPane = dynamic(() => import('./DetailPane'), { ssr: false })
const AddKnowledgeSheet = dynamic(() => import('./AddKnowledgeSheet'), { ssr: false })

interface Msg {
    id: string
    role: 'user' | 'assistant'
    content: string
    /** 서버/보낸 시각(ISO). 없으면 시각 칸을 비운다 */
    createdAt?: string
    /** 이 답에 쓴 자료 (있으면 말풍선 아래 「참고한 자료」로 보인다) */
    sources?: { id: string; title: string }[]
    /** 이 답을 쓰며 실제로 열어 읽은 링크 (성공, 실패 다 옴). 아직 서버가 안 주면 undefined  -  LinkCards 가 sources 로 대신 그린다 */
    readUrls?: ReadUrlItem[]
    /** 밖으로 나가는 일이면 답 대신 승인 카드가 온다 */
    card?: CardView
    // === 전달(relay) === 옆 봇이 대신 답한 말이면 「보낸 사람 ○○ → ○○」 표식을 단다
    relay?: RelayView
    // === /전달(relay) ===
    /** === 사진 첨부 === 내 말풍선에 붙인 사진들 (우리 저장소 주소, 최대 10) */
    imageUrls?: string[]
}

interface PublicBot { id: string; name: string; avatar_url: string | null; greeting_message: string; title?: string; sample_questions?: string[] }

const MAX_CONTEXT = 20

/** LinkCards 에 줄 것을 고른다: 서버가 실제로 읽은 링크(readUrls) > 자료로 쓴 링크(sources, "url:" 로 시작하는 것) > 방금 사용자 말 속 주소.
 *  위가 있으면 아래는 안 본다. */
function linkCardsFor(m: Msg, prevUserText?: string): { readUrls?: ReadUrlItem[]; fallbackUrls?: string[] } {
    if (m.readUrls && m.readUrls.length > 0) return { readUrls: m.readUrls }
    const fromSources = m.sources?.filter(s => s.id.startsWith('url:')).map(s => ({ url: s.id.slice(4), title: s.title, ok: true }))
    if (fromSources && fromSources.length > 0) return { readUrls: fromSources }
    return { fallbackUrls: prevUserText ? extractUrls(prevUserText) : undefined }
}

export default function OsChat({ mentorId, freshStart = false }: { mentorId: string; freshStart?: boolean }) {
    const { team, loading, guest, openNewGroup, openEditBot, setBotPresence } = useOsTeam()
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
    const cacheLoadedFor = useRef<string | null>(null)   // 이 mentorId 캐시를 읽은 뒤에만 다시 쓴다
    // === 사진 첨부 ===
    const photos = usePhotoAttach()
    const [dragging, setDragging] = useState(false)
    // === /사진 첨부 ===
    const reveal = useRevealTimestamps()
    // === @ 멘션 ===
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const inputWrapRef = useRef<HTMLDivElement>(null)
    const mentionBots = useMemo(
        () => team.filter(b => !b.hidden).map(b => ({
            mentorId: b.mentorId, name: b.name, shape: b.shape, color: b.color, avatarUrl: b.avatarUrl,
        })),
        [team],
    )
    const chipBots = useMemo(
        () => mentionBots.map(b => ({
            mentorId: b.mentorId, name: b.name, shape: b.shape, color: b.color, avatarUrl: b.avatarUrl,
        })),
        [mentionBots],
    )
    const mention = useMentionComposer(mentionBots)
    // === /@ 멘션 ===

    // 명단 상태 동그라미에 이 방 상태를 알린다
    useEffect(() => {
        setBotPresence(mentorId, state)
    }, [mentorId, state, setBotPresence])

    // 시연(?demo=1) + 탭 캐시를 이 봇 키로 동기 복원. mentorId 가 바뀌면 바로 비우고 다시 읽는다
    // (이전엔 비동기 then 이라 쓰기 효과가 다른 봇 말에 캐시를 덮어쓸 수 있었다).
    useEffect(() => {
        setDemo(new URLSearchParams(window.location.search).get('demo') === '1')
        cacheLoadedFor.current = null
        if (freshStart) {
            // 「대화 새로 시작」: 탭 캐시를 비우고 빈 방으로 시작한다 (옛 클라우드 세션은 지우지 않는다)
            clearChatCache(window.sessionStorage, mentorId)
            setMessages([])
            setSessionId(null)
            cacheLoadedFor.current = mentorId
            return
        }
        const cached = readChatCache<Msg>(window.sessionStorage, mentorId)
        if (cached) {
            setMessages(cached.messages)
            setSessionId(cached.sessionId)
        } else {
            setMessages([])
            setSessionId(null)
        }
        cacheLoadedFor.current = mentorId
    }, [mentorId, freshStart])

    // 로그인 사용자: 서버 최근 대화방을 항상 불러 클라우드 기록을 살린다.
    // 탭 캐시에 sessionId 가 있어도 건너뛰지 않는다(봇 전환 후 빈 방처럼 보이던 원인).
    // 손님 때 탭에만 있던 말은 /api/sessions/merge 로 계정에 넘긴다.
    useEffect(() => {
        if (guest) return
        let alive = true
        void (async () => {
            // 「대화 새로 시작」: 옛 세션을 불러오지 않고 클라우드에 새 세션을 만든다 (옛 기록은 DB에 남음)
            if (freshStart) {
                try {
                    const res = await fetch('/api/sessions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mentorId }),
                    })
                    const d = await res.json() as { session?: { id: string } }
                    const id = d?.session?.id ?? null
                    if (!alive) return
                    if (id) {
                        setSessionId(id)
                        setMessages([])
                        writeChatCache(window.sessionStorage, mentorId, { sessionId: id, messages: [] })
                    }
                    // URL 의 ?new= 을 벗겨 새로고침 때 또 새 세션이 안 생기게 한다
                    try {
                        const u = new URL(window.location.href)
                        if (u.searchParams.has('new')) {
                            u.searchParams.delete('new')
                            window.history.replaceState({}, '', u.pathname + (u.search ? u.search : '') + u.hash)
                        }
                    } catch { /* */ }
                } catch { /* 새 세션 실패해도 빈 방으로 둔다 */ }
                return
            }

            const cached = readChatCache<Msg>(window.sessionStorage, mentorId)
            const realSid = cached?.sessionId && !cached.sessionId.startsWith('guest-') ? cached.sessionId : null

            if (cached && cached.messages.length > 0 && !realSid) {
                try {
                    const mergeRes = await fetch('/api/sessions/merge', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            mentorId,
                            messages: cached.messages.map(m => ({ role: m.role, content: m.content })),
                        }),
                    })
                    const mergeData = await mergeRes.json() as { session?: { id: string } }
                    if (mergeRes.ok && mergeData.session?.id && alive) {
                        const sid = mergeData.session.id
                        setSessionId(sid)
                        setMessages(prev => prev.length > 0 ? prev : cached.messages)
                        writeChatCache(window.sessionStorage, mentorId, { sessionId: sid, messages: cached.messages })
                        // 이관 후에도 서버에서 한 번 더 읽어 맞춘다(아래)
                    }
                } catch { /* 이관 실패해도 아래 서버 복원으로 이어간다 */ }
            }

            try {
                const sr = await fetch(`/api/sessions?mentorId=${encodeURIComponent(mentorId)}`, { cache: 'no-store' })
                const sd = sr.ok ? await sr.json() as { sessions?: { id: string }[] } : null
                const sid = sd?.sessions?.[0]?.id
                if (!sid || !alive) return
                const mr = await fetch(`/api/sessions/${encodeURIComponent(sid)}/messages`, { cache: 'no-store' })
                const md = mr.ok ? await mr.json() as { messages?: { id: string; role: string; content: string; createdAt?: string }[] } : null
                const rows = (md?.messages ?? []).filter(m => m.role === 'user' || m.role === 'assistant').slice(-50)
                if (!alive) return
                setSessionId(sid)
                // 서버에 말이 있으면 그걸 쓴다. 저장 직전(스트림 중 전환)엔 캐시가 더 길 수 있어 더 긴 쪽을 남긴다.
                if (rows.length > 0) {
                    const mapped = rows.map(m => ({
                        id: m.id,
                        role: m.role as Msg['role'],
                        content: m.content,
                        createdAt: (m as { createdAt?: string }).createdAt,
                    }))
                    setMessages(prev => (prev.length > mapped.length ? prev : mapped))
                }
            } catch { /* 못 불러와도 캐시/새 대화로 이어간다 */ }
        })()
        return () => { alive = false }
    }, [mentorId, guest, freshStart])

    // 말이 오갈 때마다(답이 다 온 뒤) 탭 저장소에 최근 50개를 남긴다. 이 봇 캐시를 읽기 전에는 쓰지 않는다
    useEffect(() => {
        if (streaming || cacheLoadedFor.current !== mentorId) return
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

    // 폰에서 키보드가 올라오면 보이는 화면(visualViewport)이 줄어든다. 그 높이를 화면 전체 칸(os-shell)에 그대로 먹여
    // 입력 막대가 늘 그 화면 맨 아래(=키보드 바로 위)에 오게 한다(os.css `.os-shell { height: var(--os-vvh) }`, 폰 폭에서만).
    useEffect(() => {
        const vv = typeof window !== 'undefined' ? window.visualViewport : null
        if (!vv) return
        const onResize = () => document.documentElement.style.setProperty('--os-vvh', `${vv.height}px`)
        onResize()
        vv.addEventListener('resize', onResize)
        vv.addEventListener('scroll', onResize)
        return () => {
            vv.removeEventListener('resize', onResize)
            vv.removeEventListener('scroll', onResize)
            document.documentElement.style.removeProperty('--os-vvh')
        }
    }, [])

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
            // 대화 새로 시작 직후엔 옛 방을 재사용하지 않는다 (빈 새 세션을 유지)
            if (!freshStart) {
                const sr = await fetch(`/api/sessions?mentorId=${encodeURIComponent(mentorId)}`, { cache: 'no-store' })
                const sd = sr.ok ? await sr.json() as { sessions?: { id: string }[] } : null
                const existing = sd?.sessions?.[0]?.id
                if (existing) {
                    setSessionId(existing)
                    return existing
                }
            }
            const res = await fetch('/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mentorId }) })
            const d = await res.json()
            const id = d?.session?.id ?? null
            if (id) setSessionId(id)
            return id
        } catch { return null }
    }, [guest, sessionId, mentorId, freshStart])

    // overrideText 가 있으면 입력창 내용 대신 그 질문을 그대로 다시 보낸다(입력창은 지우지 않는다).
    const send = useCallback(async (overrideText?: string) => {
        const text = (overrideText ?? input).trim()
        // === 사진 첨부 === 사진만 보내도 된다. 올리는 중이거나 실패한 장이 남아 있으면 기다린다.
        const photoUrls = photos.urls
        if ((!text && photoUrls.length === 0) || streaming || photos.uploading || photos.failed) return

        // === @ 멘션 === 다른 팀 봇을 부르면 **지금 방에 남긴 채** 넘긴다. 왼쪽 명단이 상대 봇을 부른다.
        if (!overrideText && text && photoUrls.length === 0) {
            const decision = decidePersonalMentionRoute(
                text,
                team.filter(b => !b.hidden).map(b => ({ mentorId: b.mentorId, name: b.name })),
                mentorId,
            )
            if (decision.action === 'handoff') {
                setInput('')
                mention.close()
                const nowIso = new Date().toISOString()
                const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', content: text, createdAt: nowIso }
                const ack = handoffAckLine(decision.name)
                const botId = `a-${Date.now()}`
                setMessages(prev => [...prev, userMsg, { id: botId, role: 'assistant', createdAt: nowIso, content: ack }])
                setState('idle')
                emitBotCall(typeof window !== 'undefined' ? window : null, decision.mentorId)
                osTrack('os_mention_handoff', { from_mentor_id: mentorId, to_mentor_id: decision.mentorId })
                if (!guest) {
                    void (async () => {
                        try {
                            const sid = await ensureSession()
                            await fetch('/api/os/mention-handoff', {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    text,
                                    fromMentorId: mentorId,
                                    toMentorId: decision.mentorId,
                                    fromSessionId: sid ?? undefined,
                                    message: decision.message,
                                }),
                            })
                        } catch { /* 화면 안내는 이미 남겼다 */ }
                    })()
                }
                return
            }
        }
        // === /@ 멘션 ===

        osTrack('os_message_sent', { mentor_id: mentorId, guest, photos: photoUrls.length })
        if (guest) window.dispatchEvent(new Event('curi:guest-sent'))
        const nowIso = new Date().toISOString()
        const userMsg: Msg = { id: `u-${Date.now()}`, role: 'user', content: text, createdAt: nowIso, ...(photoUrls.length ? { imageUrls: photoUrls } : {}) }
        // === /사진 첨부 ===
        const botId = `a-${Date.now()}`
        const base = [...messages, userMsg]

        // === 전달(relay) === 옆 봇에게 옮겨 달라는 말이면 여기서 끝낸다 (모델 안 부름 = 클로버 안 씀)
        const 전달 = bot && !guest
            ? readRelayIntent(text, team.filter(b => !b.hidden).map(b => ({ mentorId: b.mentorId, name: b.name })), mentorId)
            : null
        if (전달) {
            if (!overrideText) setInput('')
            setMessages([...base, { id: botId, role: 'assistant', createdAt: nowIso, content: `${전달.name}에게 옮기는 중이에요…` }])
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
                        id: botId, role: 'assistant', createdAt: nowIso, content: String(d.answer ?? ''),
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
                setMessages([...base, { id: botId, role: 'assistant', createdAt: nowIso, content: '' }])
            } catch {
                setMessages([...base, { id: botId, role: 'assistant', createdAt: nowIso, content: '' }])
            }
        }
        // === /전달(relay) ===

        // 서버를 부르기 전 가벼운 규칙 2개. 내 팀 봇일 때만 본다(공개 봇에는 자료를 못 넣는다).
        // 여기서 끝나는 말은 모델을 부르지 않는다 = 클로버를 안 쓴다.
        const 눈치 = bot && !guest && !전달 && text ? readLocalIntent(text) : null
        if (눈치?.kind === 'group') {
            // === 전달(relay) === 안내만 하지 않고 「그룹 채팅 만들기」 창을 바로 연다
            if (!overrideText) setInput('')
            setMessages([...base, { id: botId, role: 'assistant', createdAt: nowIso, content: '여러 봇과 한 방에서 이야기하는 창을 열었어요. 넣을 봇을 골라 주세요.' }])
            setState('idle')
            openNewGroup()
            return
            // === /전달(relay) ===
        }
        if (눈치?.kind === 'knowledge' && bot) {
            if (!overrideText) setInput('')
            setMessages([...base, { id: botId, role: 'assistant', createdAt: nowIso, content: '자료에 넣었어요. 읽는 데 잠시 걸려요 📎' }])
            setState('idle')
            try {
                const res = await fetch('/api/os/knowledge', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mentorId, kind: 'url', url: 눈치.url }),
                })
                if (res.ok) osTrack('os_knowledge_added', { mentor_id: mentorId, kind: 'url' })
                else {
                    const d = await res.json().catch(() => ({}))
                    setMessages([...base, { id: botId, role: 'assistant', createdAt: nowIso, content: `이 링크는 못 넣었어요. ${String(d.error ?? '').slice(0, 80)}` }])
                }
            } catch {
                setMessages([...base, { id: botId, role: 'assistant', createdAt: nowIso, content: '이 링크는 못 넣었어요. 잠시 뒤 다시 해 주세요.' }])
            }
            return
        }
        setMessages([...base, { id: botId, role: 'assistant', createdAt: nowIso, content: '' }])
        if (!overrideText) setInput('')
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
                        setMessages([...base, { id: botId, role: 'assistant', createdAt: nowIso, content: '', card: draftData.card as CardView }])
                        setState('waiting_approval')
                        setStreaming(false)
                        return
                    }
                    if (draftData?.blocked?.message) {
                        setMessages([...base, { id: botId, role: 'assistant', createdAt: nowIso, content: draftData.blocked.message }])
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
            let readUrls: ReadUrlItem[] = []
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
                                setMessages([...base, { id: botId, role: 'assistant', createdAt: nowIso, content: snapshot }])
                            }
                            // 마지막 조각에 「이 답에 쓴 자료」가 실려 온다
                            if (d.done && Array.isArray(d.sources)) sources = d.sources
                            // 곧 온다: 실제로 열어 읽은 링크(성공, 실패). 없으면 위 sources 로 LinkCards 가 대신 그린다
                            if (d.done && Array.isArray(d.readUrls)) readUrls = d.readUrls
                            if (d.done && d.guestLimit) window.dispatchEvent(new CustomEvent('curi:login-nudge', { detail: { reason: 'limit' } }))
                        } catch { /* 조각 하나 깨진 건 넘어간다 */ }
                    }
                }
            }
            setState(full.includes(UNAVAILABLE_TEXT) ? 'error' : 'idle')
            if (!full) setMessages([...base, { id: botId, role: 'assistant', createdAt: nowIso, content: UNAVAILABLE_TEXT }])
            else if (sources.length > 0 || readUrls.length > 0) setMessages([...base, { id: botId, role: 'assistant', createdAt: nowIso, content: full, sources, readUrls }])
        } catch {
            setState('error')
            setMessages([...base, { id: botId, role: 'assistant', createdAt: nowIso, content: UNAVAILABLE_TEXT }])
        } finally {
            setStreaming(false)
        }
        // === 전달(relay), 사진 첨부 === team, openNewGroup, name, photos 가 더 들어간다
    }, [input, streaming, messages, mentorId, guest, bot, ensureSession, team, openNewGroup, name, photos, mention])

    const applyMention = (item: { mentorId: string; name: string }) => {
        const el = inputRef.current
        const cursor = el?.selectionStart ?? input.length
        const next = mention.insert(input, cursor, item)
        setInput(next.text)
        setState(next.text ? 'listening' : 'idle')
        requestAnimationFrame(() => {
            const ta = inputRef.current
            if (!ta) return
            ta.focus()
            ta.setSelectionRange(next.cursor, next.cursor)
        })
    }

    const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const keyResult = mention.onKeyWhileOpen(e)
        if (keyResult === 'handled') return
        if (keyResult === 'select' && mention.activeItem) {
            applyMention(mention.activeItem)
            return
        }
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
            <div className="os-chat-col">
                <header className="os-chat-head">
                    <button type="button" className="os-chat-head-bot" onClick={() => bot && openEditBot(bot)}
                        disabled={!bot || guest || bot.id.startsWith('demo-')}
                        title={bot && !guest && !bot.id.startsWith('demo-') ? '봇 편집' : undefined}
                        aria-label={bot && !guest && !bot.id.startsWith('demo-') ? `${name} 편집` : name}>
                        {avatar}
                        <span>{name}</span>
                    </button>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <button className="os-icon-btn os-menu" aria-label="세부 정보 열기" aria-expanded={detailOpen}
                            title="세부 정보 열기" onClick={() => setDetailOpen(v => !v)}><MenuIcon /></button>
                    </span>
                </header>

                {/* 오늘 체크인 띠  -  오늘 아직 안 했을 때만. 손님, 시연에선 안 뜬다 */}

                <div className={`os-messages${reveal.className ? ` ${reveal.className}` : ''}`} ref={reveal.ref} style={reveal.style}>
                    {messages.length === 0 && !bot && publicBot && (
                        <div className="os-chat-info">
                            <BotAvatar shape="circle" color="white" state="idle" size={96} faceUrl={publicBot.avatar_url ?? null} name={name} />
                            <div className="os-chat-info-name">{name}</div>
                            {(publicBot.title || greeting) && (
                                <div className="os-chat-info-line">{publicBot.title || greeting}</div>
                            )}
                            <div className="os-chat-info-qs">
                                {(Array.isArray(publicBot.sample_questions) && publicBot.sample_questions.length > 0
                                    ? publicBot.sample_questions.slice(0, 3)
                                    : [`${name}에게 뭐부터 물어보면 좋아요?`]
                                ).map((q, i) => (
                                    <button key={i} type="button" className="os-chat-info-q" onClick={() => void send(q)}>
                                        {q}
                                    </button>
                                ))}
                            </div>
                            <div className="os-chat-info-actions">
                                <Link href={`/os/market/${mentorId}`} className="os-btn" style={{ textDecoration: 'none', display: 'inline-grid', placeItems: 'center' }}>
                                    소개 다시 보기
                                </Link>
                            </div>
                        </div>
                    )}
                    {greeting && messages.length === 0 && !(!bot && publicBot) && (
                        <MsgRow side="bot">
                            <div className="os-sender">{avatar}<span>{name}</span></div>
                            <div className="os-bubble bot">{greeting}</div>
                        </MsgRow>
                    )}
                    {messages.map((m, i) => m.role === 'user'
                        ? (m.imageUrls && m.imageUrls.length > 0
                            // === 사진 첨부 === 사진 격자 + 글
                            ? <MsgRow key={m.id} side="me" createdAt={m.createdAt}>
                                <div className="os-bubble me has-photos"><PhotoGrid urls={m.imageUrls} />{m.content && !isUrlOnlyText(m.content) && <div className="os-photo-text"><MentionRichText text={m.content} bots={chipBots} /></div>}</div>
                                {m.content ? <OgLinkPreview text={m.content} className="os-og-cards--me" /> : null}
                              </MsgRow>
                            : <MsgRow key={m.id} side="me" createdAt={m.createdAt}>
                                {!isUrlOnlyText(m.content) && <div className="os-bubble me"><MentionRichText text={m.content} bots={chipBots} /></div>}
                                <OgLinkPreview text={m.content} className="os-og-cards--me" />
                              </MsgRow>)
                        // === 전달(relay) === 옆 봇이 대신 답한 말은 그 봇 얼굴, 이름으로 그린다
                        : m.relay
                            ? <MsgRow key={m.id} side="bot" createdAt={m.createdAt}><RelayBubble view={m.relay} answer={m.content} /></MsgRow>
                        // === /전달(relay) ===
                        : (
                            <MsgRow key={m.id} side="bot" createdAt={m.createdAt}>
                                {(!m.content && !m.card && (streaming || state === 'thinking')) ? (
                                    <WorkingStatusLine botName={name} avatar={avatar} />
                                ) : (
                                    <>
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
                                            : (m.content && !isUrlOnlyText(m.content)
                                                ? <div className="os-bubble bot md"><MentionRichText text={m.content} bots={chipBots} markdown /></div>
                                                : null)}
                                        {m.content && !m.card && <OgLinkPreview text={m.content} />}
                                        {m.sources && m.sources.length > 0 && (
                                            <div className="os-cite">📎 참고한 자료: {m.sources.map(s => s.title).join(', ')}</div>
                                        )}
                                        {!m.card && (
                                            <LinkCards {...linkCardsFor(m, messages[i - 1]?.role === 'user' ? messages[i - 1].content : undefined)} />
                                        )}
                                    </>
                                )}
                            </MsgRow>
                        ))}
                    <div ref={endRef} />
                </div>

                {/* 입력 막대 dock  -  폰에선 화면 맨 아래 붙는다(os.css). 미리보기 띠 + 막대를 한 칸으로 묶어야
                    그 아래 빈 배경이 흰 띠로 안 남는다(대표 폰 실측 0923) */}
                <div className="os-input-dock">
                    {/* === 사진 첨부 === 붙인 사진 미리보기 띠 (입력창 위) */}
                    <PhotoStrip items={photos.items} notice={photos.notice} onRemove={photos.remove} onRetry={photos.retry} />
                    {/* === /사진 첨부 === */}

                    <div className="os-input-bar">
                        {/* === 사진 첨부 === ＋ 메뉴: 사진 붙이기 / 자료 넣기 */}
                        <PhotoPlusMenu canKnowledge={!!bot} onPickPhotos={photos.add} onKnowledge={() => setAddSheet(true)} />
                        {/* === /사진 첨부 === */}
                        <div className="os-input-wrap" ref={inputWrapRef}>
                            {mention.open && (
                                <MentionPicker
                                    items={mention.items}
                                    activeIndex={mention.activeIndex}
                                    onHover={mention.setActiveIndex}
                                    onSelect={applyMention}
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
                                    if (!streaming) setState(v ? 'listening' : 'idle')
                                    mention.syncAfterChange(v, e.target.selectionStart ?? v.length, inputRef)
                                }}
                                onClick={e => mention.syncFromInput(input, e.currentTarget.selectionStart ?? input.length)}
                                onKeyUp={e => {
                                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                                        mention.syncFromInput(input, e.currentTarget.selectionStart ?? input.length)
                                    }
                                }}
                                onKeyDown={onKey}
                                onFocus={() => endRef.current?.scrollIntoView({ behavior: 'smooth' })}
                                onPaste={e => { if (photos.addFromData(e.clipboardData)) e.preventDefault() }}
                                placeholder={`${name}에게 메시지 보내기 (@로 다른 봇 부르기)`}
                                aria-label="메시지"
                                aria-autocomplete="list"
                                aria-expanded={mention.open}
                                style={{ resize: 'none' }}
                            />
                            </div>
                        </div>
                        <button className="os-icon-btn os-send" aria-label="보내기"
                            disabled={(!input.trim() && photos.urls.length === 0) || streaming || photos.uploading || photos.failed}
                            title={photos.uploading ? '사진을 올리는 중이에요' : photos.failed ? '실패한 사진을 빼거나 다시 시도해 주세요' : undefined}
                            onClick={() => void send()}>↑</button>
                    </div>
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
