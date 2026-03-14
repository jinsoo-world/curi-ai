'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { MentorHeader, ChatMessages, ChatInput, SuggestionCards, ElevenLabsWidget, VoiceCallOverlay } from './components'
import ChatSidebar from './components/ChatSidebar'
import MarketingConsentPopup from '@/components/MarketingConsentPopup'
import type { ChatMessage } from './components'

interface MentorData {
    id: string
    name: string
    slug: string
    title: string
    avatar_url: string | null
    voice_sample_url: string | null
    voice_id: string | null
    greeting_message: string
    sample_questions: string[]
    system_prompt: string
}

// 멘토별 프로필 이미지
const MENTOR_IMAGES: Record<string, string> = {
    '열정진': '/mentors/passion-jjin.png',
    '글담쌤': '/mentors/geuldam.jpg',
    'Cathy': '/mentors/cathy.jpeg',
    '봉이 김선달': '/mentors/bongi-kimsundal.png',
    '신사임당': '/mentors/shin-saimdang.png',
}

// 멘토별 아바타 이모지 (fallback)
const MENTOR_EMOJI: Record<string, string> = {
    'passion-jin': '🔥',
    'geuldam': '✍️',
    'cathy': '🚀',
    'bongi-kimsundal': '😏',
    'shin-saimdang': '🎨',
}

// ElevenLabs 에이전트 ID (멘토별)
const ELEVENLABS_AGENT_IDS: Record<string, string> = {
    'Cathy': 'agent_6801kjg12gxhfxbaskx3y8s1szf1',  // TODO: Cathy 전용 에이전트 생성 후 교체
}

/** 전송할 컨텍스트 메시지 수 (최근 N턴) */
const MAX_CONTEXT_MESSAGES = 20

/** 연속 전송 방지 딜레이 (ms) */
const SEND_DELAY_MS = 500

/** 비로그인 사용자 일일 대화 카운트 (localStorage) */
function getGuestMessageCount(): number {
    if (typeof window === 'undefined') return 0
    try {
        const data = JSON.parse(localStorage.getItem('guest_chat_usage') || '{}')
        const today = new Date().toISOString().slice(0, 10)
        if (data.date !== today) return 0
        return data.count || 0
    } catch { return 0 }
}

function incrementGuestMessageCount(): void {
    if (typeof window === 'undefined') return
    const today = new Date().toISOString().slice(0, 10)
    const data = JSON.parse(localStorage.getItem('guest_chat_usage') || '{}')
    if (data.date !== today) {
        localStorage.setItem('guest_chat_usage', JSON.stringify({ date: today, count: 1 }))
    } else {
        localStorage.setItem('guest_chat_usage', JSON.stringify({ date: today, count: (data.count || 0) + 1 }))
    }
}

/** 게스트 대화 메시지를 localStorage에 저장 */
function saveGuestMessages(mentorId: string, msgs: { role: string; content: string }[]): void {
    if (typeof window === 'undefined') return
    try {
        localStorage.setItem(`guest_chat_messages_${mentorId}`, JSON.stringify(msgs))
    } catch { }
}

/** localStorage에서 게스트 대화 메시지 읽기 */
function loadGuestMessages(mentorId: string): { role: string; content: string }[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = localStorage.getItem(`guest_chat_messages_${mentorId}`)
        return raw ? JSON.parse(raw) : []
    } catch { return [] }
}

/** localStorage에서 게스트 대화 메시지 삭제 */
function clearGuestMessages(mentorId: string): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(`guest_chat_messages_${mentorId}`)
}

export default function ChatPage() {
    const router = useRouter()
    const params = useParams()
    const searchParams = useSearchParams()
    const mentorId = params.mentorId as string
    const existingSessionId = searchParams.get('session')

    const [mentor, setMentor] = useState<MentorData | null>(null)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [showSuggestions, setShowSuggestions] = useState(true)
    const [lastSentAt, setLastSentAt] = useState(0)
    const [isCallOpen, setIsCallOpen] = useState(false)
    const [sidebarSessions, setSidebarSessions] = useState<any[]>([])
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const [showMarketingPopup, setShowMarketingPopup] = useState(false)
    const [marketingChecked, setMarketingChecked] = useState(false)
    const [autoTTS, setAutoTTS] = useState(false)
    const [voiceCallOpen, setVoiceCallOpen] = useState(false)

    const [userName, setUserName] = useState('')

    // 프로필에서 autoTTS 설정 + 유저 이름 로드
    useEffect(() => {
        async function loadProfile() {
            try {
                const res = await fetch('/api/profile')
                if (res.ok) {
                    const data = await res.json()
                    if (data?.profile?.auto_tts) setAutoTTS(true)
                    const name = data?.profile?.google_name || data?.profile?.name || ''
                    if (name) setUserName(name)
                }
            } catch { /* 게스트는 무시 */ }
        }
        loadProfile()
    }, [])

    const toggleAutoTTS = useCallback(async () => {
        const next = !autoTTS
        setAutoTTS(next)
        try {
            await fetch('/api/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ auto_tts: next }),
            })
        } catch { /* 게스트는 로컬만 */ }
    }, [autoTTS])


    const messagesEndRef = useRef<HTMLDivElement>(null)
    const chatContainerRef = useRef<HTMLDivElement>(null)

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [])

    // ───── 멘토 정보 로드 ─────
    useEffect(() => {
        async function loadMentor() {
            try {
                const res = await fetch(`/api/mentors/${mentorId}`)
                if (!res.ok) {
                    router.push('/mentors')
                    return
                }
                const { mentor: data } = await res.json()
                if (data) {
                    setMentor(data)
                    setSuggestions(data.sample_questions || [])
                } else {
                    router.push('/mentors')
                }
            } catch (e) {
                console.error('멘토 로드 실패:', e)
                router.push('/mentors')
            }
        }
        loadMentor()
    }, [mentorId, router])

    // ───── 기존 세션 로드 or 새 세션 생성 ─────
    const isNewChatRequested = searchParams.get('new') === 'true'

    useEffect(() => {
        async function initSession() {
            if (!mentorId) return

            // ── 1. 로그인 여부 확인 ──
            let isLoggedIn = false
            try {
                const authRes = await fetch('/api/auth/me')
                const authData = await authRes.json()
                isLoggedIn = !!authData?.user
            } catch {
                isLoggedIn = false
            }

            // ── 2. 비로그인(게스트): 고정 ID, URL 변경 없음 ──
            if (!isLoggedIn) {
                const guestId = `guest-${mentorId}`
                setSessionId(guestId)
                // localStorage에서 이전 게스트 대화 복원
                const guestMsgs = loadGuestMessages(mentorId)
                if (guestMsgs.length > 0) {
                    const restored = guestMsgs.map((m: { role: string; content: string; createdAt?: string }, i: number) => ({
                        id: `guest-msg-${i}`,
                        role: m.role as 'user' | 'assistant',
                        content: m.content,
                        createdAt: m.createdAt || undefined,
                    }))
                    setMessages(restored)
                    setShowSuggestions(false)
                }
                return // URL 변경 없이 종료
            }

            // ── 3. 로그인 유저: URL에 ?session=xxx가 있으면 기존 세션 로드 ──
            if (existingSessionId && !existingSessionId.startsWith('guest-')) {
                setSessionId(existingSessionId)
                try {
                    const res = await fetch(`/api/sessions/${existingSessionId}/messages`)
                    const { messages: loaded } = await res.json()
                    if (loaded?.length) {
                        setMessages(loaded)
                        setShowSuggestions(false)
                    } else {
                        // 빈 세션 → 추천 질문 표시
                        setShowSuggestions(true)
                    }
                } catch (e) {
                    console.error('메시지 로드 실패:', e)
                }
                return
            }

            // ?new=true가 아니면 → 기존 세션 찾아서 이어가기
            if (!isNewChatRequested) {
                try {
                    const res = await fetch(`/api/sessions?mentorId=${mentorId}`)
                    const { sessions } = await res.json()
                    if (sessions?.length > 0) {
                        const lastSession = sessions[0] // 최근 순 정렬
                        setSessionId(lastSession.id)
                        // 메시지 로드
                        const msgRes = await fetch(`/api/sessions/${lastSession.id}/messages`)
                        const { messages: loaded } = await msgRes.json()
                        if (loaded?.length) {
                            setMessages(loaded)
                            setShowSuggestions(false)
                        } else {
                            // 빈 세션 → 추천 질문 표시
                            setShowSuggestions(true)
                        }
                        // URL 업데이트 (히스토리 교체, 새로고침 없음)
                        window.history.replaceState(null, '', `/chat/${mentorId}?session=${lastSession.id}`)
                        return
                    }
                } catch (e) {
                    console.error('기존 세션 조회 실패:', e)
                }
            }

            // 게스트 대화 Merge 확인 (로그인 상태에서 이전 게스트 대화 이관)
            const guestMsgs = loadGuestMessages(mentorId)
            if (guestMsgs.length > 0) {
                try {
                    const mergeRes = await fetch('/api/sessions/merge', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mentorId, messages: guestMsgs }),
                    })
                    const mergeData = await mergeRes.json()
                    if (mergeRes.ok && mergeData.session) {
                        setSessionId(mergeData.session.id)
                        // 이관된 메시지를 화면에 표시
                        const restored = guestMsgs.map((m: { role: string; content: string; createdAt?: string }, i: number) => ({
                            id: `merged-${i}`,
                            role: m.role as 'user' | 'assistant',
                            content: m.content,
                            createdAt: m.createdAt || undefined,
                        }))
                        setMessages(restored)
                        setShowSuggestions(false)
                        clearGuestMessages(mentorId)
                        window.history.replaceState(null, '', `/chat/${mentorId}?session=${mergeData.session.id}`)
                        return
                    }
                } catch (e) {
                    console.error('게스트 대화 이관 실패:', e)
                }
                clearGuestMessages(mentorId)
            }

            // 새 세션 생성 (로그인 유저만)
            try {
                const res = await fetch('/api/sessions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mentorId }),
                })
                const { session } = await res.json()
                if (session) {
                    setSessionId(session.id)
                    window.history.replaceState(null, '', `/chat/${mentorId}?session=${session.id}`)
                }
            } catch (e) {
                console.error('세션 생성 실패:', e)
            }
        }
        initSession()
    }, [mentorId, existingSessionId, isNewChatRequested])

    // ───── 사이드바 세션 목록 로드 ─────
    const loadSidebarSessions = useCallback(async () => {
        try {
            const res = await fetch(`/api/sessions?mentorId=${mentorId}`)
            const { sessions } = await res.json()
            setSidebarSessions(sessions || [])
        } catch (e) {
            console.error('사이드바 세션 로드 실패:', e)
        }
    }, [mentorId])

    useEffect(() => {
        loadSidebarSessions()
    }, [loadSidebarSessions, sessionId])

    // ───── 세션 업데이트 (고정/이름변경) ─────
    const handleUpdateSession = useCallback(async (sid: string, updates: { title?: string; is_pinned?: boolean }) => {
        try {
            await fetch(`/api/sessions/${sid}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            })
            loadSidebarSessions()
        } catch (e) {
            console.error('세션 업데이트 실패:', e)
        }
    }, [loadSidebarSessions])

    // ───── 세션 삭제 (사이드바 → 상태 동기화) ─────
    const handleDeleteSession = useCallback(async (sid: string) => {
        try {
            const res = await fetch(`/api/sessions/${sid}`, { method: 'DELETE' })
            const data = await res.json()
            if (data.ok) {
                // 클라이언트 상태에서 제거 (리로드 없이)
                setSidebarSessions(prev => prev.filter(s => s.id !== sid))
                // 현재 보고있는 세션이면 새 대화 시작
                if (sid === sessionId) {
                    handleNewChat()
                }
            } else {
                alert(data.error || '삭제 실패')
            }
        } catch {
            alert('삭제 중 오류가 발생했습니다.')
        }
    }, [sessionId])

    // ───── 세션 선택 ─────
    const handleSelectSession = useCallback(async (sid: string) => {
        if (sid === sessionId) return
        setSessionId(sid)
        setIsSidebarOpen(false)
        window.history.replaceState(null, '', `/chat/${mentorId}?session=${sid}`)
        try {
            const res = await fetch(`/api/sessions/${sid}/messages`)
            const { messages: loaded } = await res.json()
            setMessages(loaded || [])
            setShowSuggestions(!loaded?.length)
        } catch (e) {
            console.error('메시지 로드 실패:', e)
        }
    }, [sessionId, mentorId])

    // ───── 스크롤 ─────
    useEffect(() => {
        scrollToBottom()
    }, [messages, scrollToBottom])

    // ───── 추천 질문 ─────
    const fetchSuggestions = useCallback(async (currentMessages: ChatMessage[]) => {
        try {
            // 이미 사용자가 보낸 질문 수집 (중복 방지)
            const askedQuestions = currentMessages
                .filter(m => m.role === 'user')
                .map(m => m.content.trim().toLowerCase())

            const res = await fetch('/api/suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: currentMessages.slice(-4),
                    mentorId,
                }),
            })
            const data = await res.json()
            if (data.suggestions) {
                // 이미 물어본 질문 필터링
                const filtered = data.suggestions.filter(
                    (s: string) => !askedQuestions.includes(s.trim().toLowerCase())
                )
                setSuggestions(filtered)
                setShowSuggestions(true)
            }
        } catch { }
    }, [mentorId])

    // ───── 메시지 전송 ─────
    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim() || isStreaming) return

        // 0.5초 딜레이 방지
        const now = Date.now()
        if (now - lastSentAt < SEND_DELAY_MS) return
        setLastSentAt(now)

        const userMessage: ChatMessage = {
            id: `user-${now}`,
            role: 'user',
            content: content.trim(),
            createdAt: new Date().toISOString(),
        }

        const assistantId = `assistant-${now}`
        const baseMessages: ChatMessage[] = [...messages, userMessage]

        // 🍀 2번째 질문마다 클로버 트리거
        const userMsgCount = baseMessages.filter(m => m.role === 'user').length
        if (userMsgCount > 0 && userMsgCount % 2 === 0) {
            window.dispatchEvent(new CustomEvent('clover-chat-trigger'))
        }

        // 빈 어시스턴트 메시지 추가 (타이핑 인디케이터 표시)
        setMessages([...baseMessages, { id: assistantId, role: 'assistant', content: '', createdAt: new Date().toISOString() }])
        setInput('')
        setIsStreaming(true)
        setShowSuggestions(false)

        try {
            const contextMessages = baseMessages
                .slice(-MAX_CONTEXT_MESSAGES)
                .map(m => ({ role: m.role, content: m.content }))

            const isGuest = !sessionId || sessionId.startsWith('guest-')

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: contextMessages,
                    mentorId,
                    sessionId,
                    ...(isGuest ? { guestMessageCount: getGuestMessageCount() } : {}),
                }),
            })

            if (!res.ok) throw new Error(`Chat API error: ${res.status}`)

            const reader = res.body?.getReader()
            const decoder = new TextDecoder()
            if (!reader) throw new Error('No reader available')

            let fullContent = ''
            let sseBuffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                sseBuffer += decoder.decode(value, { stream: true })

                // SSE 이벤트는 \n\n 으로 구분
                const parts = sseBuffer.split('\n\n')
                sseBuffer = parts.pop() || ''

                for (const part of parts) {
                    for (const line of part.split('\n')) {
                        if (!line.startsWith('data: ')) continue
                        try {
                            const data = JSON.parse(line.slice(6))
                            if (data.text) {
                                fullContent += data.text
                                // 직접 새 배열을 생성하여 React가 변경을 감지하도록 함
                                const updatedContent = fullContent
                                setMessages([
                                    ...baseMessages,
                                    { id: assistantId, role: 'assistant', content: updatedContent, createdAt: new Date().toISOString() },
                                ])
                            }
                            if (data.done) {
                                setIsStreaming(false)
                                // 비회원 대화 제한 → 로그인 유도 마커 추가
                                const finalContent = data.guestLimit 
                                    ? fullContent + '\n\n__GUEST_LOGIN_CTA__'
                                    : fullContent
                                const finalMessages: ChatMessage[] = [
                                    ...baseMessages,
                                    { id: assistantId, role: 'assistant', content: finalContent, createdAt: new Date().toISOString() },
                                ]
                                setMessages(finalMessages)
                                if (!data.guestLimit) fetchSuggestions(finalMessages)
                            }
                        } catch {
                            // SSE parse error — skip malformed data
                        }
                    }
                }
            }

            // 스트림 종료 후 안전 처리
            if (fullContent) {
                setMessages([
                    ...baseMessages,
                    { id: assistantId, role: 'assistant', content: fullContent, createdAt: new Date().toISOString() },
                ])
            }
            // 비로그인 사용자: localStorage 카운트 증가 + 대화 저장
            if (isGuest) {
                incrementGuestMessageCount()
                // 게스트 메시지를 localStorage에 저장 (로그인 시 이관용)
                const allMsgs = fullContent
                    ? [...baseMessages, { id: assistantId, role: 'assistant' as const, content: fullContent, createdAt: new Date().toISOString() }]
                    : baseMessages
                saveGuestMessages(mentorId, allMsgs.map(m => ({ role: m.role, content: m.content, createdAt: m.createdAt })))
            }
            setIsStreaming(false)
        } catch (error) {
            console.error('Chat error:', error)
            setMessages([
                ...baseMessages,
                { id: assistantId, role: 'assistant', content: '앗, 잠깐 문제가 생겼어요. 다시 한번 말씀해주실래요?', createdAt: new Date().toISOString() },
            ])
            setIsStreaming(false)
        }
    }, [isStreaming, lastSentAt, messages, mentorId, sessionId, fetchSuggestions])

    // ───── 마수동 2차 터치: 대화 3회 후 미동의 유저에게 팝업 ─────
    useEffect(() => {
        if (marketingChecked) return
        const userMsgCount = messages.filter(m => m.role === 'user').length
        if (userMsgCount < 3) return

        // 이미 팝업 dismissed 했으면 재표시 안 함
        if (typeof window !== 'undefined' && localStorage.getItem('marketing_popup_dismissed')) return

        async function checkMarketingConsent() {
            try {
                const res = await fetch('/api/auth/me')
                const data = await res.json()
                if (!data?.user) return // 게스트는 스킵

                const profileRes = await fetch('/api/profile')
                const profileData = await profileRes.json()
                const consent = profileData?.profile?.marketing_consent ?? profileData?.marketing_consent
                if (!consent) {
                    setShowMarketingPopup(true)
                }
            } catch { /* skip */ }
            setMarketingChecked(true)
        }
        checkMarketingConsent()
    }, [messages, marketingChecked])

    const handleMarketingAccept = async () => {
        setShowMarketingPopup(false)
        try {
            // 1. DB에 marketing_consent 업데이트
            await fetch('/api/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ marketing_consent: true }),
            })
            // 2. 클로버 보너스 지급
            await fetch('/api/credits/marketing-bonus', { method: 'POST' })
        } catch (e) {
            console.error('Marketing consent update error:', e)
        }
    }

    const handleMarketingDismiss = () => {
        setShowMarketingPopup(false)
        if (typeof window !== 'undefined') {
            localStorage.setItem('marketing_popup_dismissed', 'true')
        }
    }



    const handleNewChat = useCallback(async () => {
        setMessages([])
        setShowSuggestions(true)
        setSuggestions(mentor?.sample_questions || [])
        // 새 세션 생성
        try {
            const res = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId }),
            })
            const { session } = await res.json()
            if (session) {
                setSessionId(session.id)
                window.history.replaceState(null, '', `/chat/${mentorId}?session=${session.id}`)
                loadSidebarSessions()
                // 강제 re-render
                setSuggestions([...mentor?.sample_questions || []])
            }
        } catch (e) {
            console.error('새 세션 생성 실패:', e)
        }
    }, [mentor, mentorId, loadSidebarSessions])

    // ───── 로딩 스켈레톤 ─────
    if (!mentor) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100dvh',
                background: '#faf8f5',
            }}>
                {/* 스켈레톤 헤더 */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 24px', borderBottom: '1px solid #eee', background: '#fff',
                }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#e4e4e7', animation: 'pulseSkeleton 1.5s ease-in-out infinite' }} />
                    <div>
                        <div style={{ width: 80, height: 16, borderRadius: 8, background: '#e4e4e7', marginBottom: 6, animation: 'pulseSkeleton 1.5s ease-in-out infinite' }} />
                        <div style={{ width: 140, height: 12, borderRadius: 6, background: '#f0f0f0', animation: 'pulseSkeleton 1.5s ease-in-out 0.3s infinite' }} />
                    </div>
                </div>
                {/* 스켈레톤 메시지 영역 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px', gap: 16 }}>
                    <div style={{ width: 88, height: 88, borderRadius: '50%', background: '#e4e4e7', animation: 'pulseSkeleton 1.5s ease-in-out infinite' }} />
                    <div style={{ width: 100, height: 20, borderRadius: 10, background: '#e4e4e7', animation: 'pulseSkeleton 1.5s ease-in-out 0.2s infinite' }} />
                    <div style={{ width: 200, height: 14, borderRadius: 7, background: '#f0f0f0', animation: 'pulseSkeleton 1.5s ease-in-out 0.4s infinite' }} />
                    <div style={{ width: '80%', maxWidth: 400, height: 60, borderRadius: 20, background: '#f0ede8', marginTop: 16, animation: 'pulseSkeleton 1.5s ease-in-out 0.6s infinite' }} />
                </div>
                <style>{`
                    @keyframes spin { to { transform: rotate(360deg) } }
                    @keyframes pulseSkeleton { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
                `}</style>
            </div>
        )
    }

    const mentorImage = mentor.avatar_url || MENTOR_IMAGES[mentor.name]
    const mentorEmoji = MENTOR_EMOJI[mentor.slug] || ''

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'row',
            height: '100dvh',
            background: '#faf8f5',
        }}>
            {/* 사이드바 */}
            <ChatSidebar
                sessions={sidebarSessions.map(s => ({
                    id: s.id,
                    title: s.title || '',
                    last_message_at: s.last_message_at || s.created_at,
                    message_count: s.message_count || 0,
                    is_pinned: s.is_pinned || false,
                    mentors: s.mentors || null,
                }))}
                currentSessionId={sessionId}
                mentorName={mentor.name}
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                onSelectSession={handleSelectSession}
                onNewChat={handleNewChat}
                onUpdateSession={handleUpdateSession}
                onDeleteSession={handleDeleteSession}
            />

            {/* 메인 채팅 영역 */}
            <div
                onClick={() => { if (isSidebarOpen) setIsSidebarOpen(false) }}
                style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minWidth: 0,
                height: '100dvh',
            }}>
                <MentorHeader
                    mentor={mentor}
                    mentorImage={mentorImage}
                    mentorEmoji={mentorEmoji}
                    isStreaming={isStreaming}
                    onNewChat={handleNewChat}
                    onCall={ELEVENLABS_AGENT_IDS[mentor.name] ? () => setIsCallOpen(true) : undefined}
                    onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                    isSidebarOpen={isSidebarOpen}
                />

                {/* Messages Area */}
                <div
                    ref={chatContainerRef}
                    role="log"
                    aria-label={`${mentor.name} 멘토와의 대화`}
                    aria-live="polite"
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        display: 'flex',
                        justifyContent: 'center',
                        WebkitOverflowScrolling: 'touch',
                    }}
                >
                    <div className="chat-messages-inner" style={{
                        width: '100%',
                        maxWidth: 720,
                        padding: '24px clamp(16px, 4vw, 32px)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 28,
                    }}>
                        {/* 🎯 Lenny 스타일 Welcome */}
                        {messages.length === 0 && (
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                padding: '48px 20px 32px',
                            }}>
                                {/* 아바타 + 온라인 표시 */}
                                <div style={{ position: 'relative', marginBottom: 16 }}>
                                    <img
                                        src={mentorImage || '/logo.png'}
                                        alt={mentor.name}
                                        style={{
                                            width: 96,
                                            height: 96,
                                            borderRadius: '50%',
                                            objectFit: 'cover',
                                            border: '3px solid #fff',
                                            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                        }}
                                    />
                                    {/* 온라인 녹색 점 */}
                                    <div style={{
                                        position: 'absolute',
                                        bottom: 4,
                                        right: 4,
                                        width: 18,
                                        height: 18,
                                        borderRadius: '50%',
                                        background: '#22c55e',
                                        border: '3px solid #fff',
                                    }} />
                                </div>

                                {/* 이름 + AI 배지 */}
                                <h2 style={{
                                    margin: 0,
                                    fontSize: 28,
                                    fontWeight: 800,
                                    color: '#18181b',
                                    marginBottom: 4,
                                    letterSpacing: '-0.02em',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                }}>
                                    {mentor.name}
                                    <span style={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: '#22c55e',
                                        background: '#f0fdf4',
                                        borderRadius: 100,
                                        padding: '3px 10px',
                                    }}>AI</span>
                                </h2>
                                <p style={{
                                    margin: 0,
                                    fontSize: 14,
                                    color: '#6b7280',
                                    marginBottom: 24,
                                }}>
                                    {mentor.title}
                                </p>

                                {/* 💬 Chat / 📞 Call 버튼 */}
                                <div style={{
                                    display: 'flex',
                                    gap: 12,
                                    marginBottom: 36,
                                }}>
                                    <button
                                        onClick={() => {
                                            document.querySelector<HTMLTextAreaElement>('textarea')?.focus()
                                        }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            padding: '10px 24px',
                                            borderRadius: 100,
                                            border: 'none',
                                            background: '#22c55e',
                                            color: '#fff',
                                            fontSize: 15,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            boxShadow: '0 2px 8px rgba(34,197,94,0.25)',
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.transform = 'scale(1.04)'
                                            e.currentTarget.style.boxShadow = '0 4px 16px rgba(34,197,94,0.35)'
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.transform = 'scale(1)'
                                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(34,197,94,0.25)'
                                        }}
                                    >
                                        💬 대화하기
                                    </button>
                                    {mentor.voice_sample_url && (
                                    <button
                                        onClick={() => setVoiceCallOpen(true)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            padding: '10px 24px',
                                            borderRadius: 100,
                                            border: 'none',
                                            background: '#16a34a',
                                            color: '#fff',
                                            fontSize: 15,
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            boxShadow: '0 2px 8px rgba(22,163,74,0.25)',
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.transform = 'scale(1.04)'
                                            e.currentTarget.style.boxShadow = '0 4px 16px rgba(22,163,74,0.35)'
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.transform = 'scale(1)'
                                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(22,163,74,0.25)'
                                        }}
                                    >
                                        📞 전화하기
                                    </button>
                                    )}
                                </div>

                                {/* 추천 질문 — Lenny 스타일 리스트 */}
                                {showSuggestions && suggestions.length > 0 && (
                                    <div style={{ width: '100%', maxWidth: 520 }}>
                                        <h3 style={{
                                            fontSize: 16,
                                            fontWeight: 700,
                                            color: '#1e293b',
                                            margin: '0 0 14px 0',
                                        }}>
                                            이런 걸 물어보세요
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {suggestions.map((q, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => sendMessage(q)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 12,
                                                        padding: '14px 18px',
                                                        borderRadius: 14,
                                                        border: '1px solid #e5e7eb',
                                                        background: '#fff',
                                                        color: '#374151',
                                                        fontSize: 14,
                                                        fontWeight: 500,
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                        transition: 'all 0.2s',
                                                        lineHeight: 1.5,
                                                    }}
                                                    onMouseEnter={e => {
                                                        e.currentTarget.style.borderColor = '#22c55e'
                                                        e.currentTarget.style.background = '#f0fdf4'
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.currentTarget.style.borderColor = '#e5e7eb'
                                                        e.currentTarget.style.background = '#fff'
                                                    }}
                                                >
                                                    <span style={{ fontSize: 16, opacity: 0.5, flexShrink: 0 }}>✦</span>
                                                    {q}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* 대화 메시지 */}
                        <ChatMessages
                            messages={messages}
                            mentor={mentor}
                            mentorImage={mentorImage}
                            mentorEmoji={mentorEmoji}
                            isStreaming={isStreaming}
                            autoTTS={autoTTS}
                            systemPrompt={mentor?.system_prompt}
                        />



                        <div ref={messagesEndRef} />
                    </div>
                </div>

                <ChatInput
                    value={input}
                    onChange={setInput}
                    onSubmit={sendMessage}
                    isStreaming={isStreaming}
                />

                {/* 자동 음성 재생 토글 */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    paddingBottom: 4,
                }}>
                    <button
                        onClick={toggleAutoTTS}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '5px 14px',
                            borderRadius: 20,
                            border: 'none',
                            background: autoTTS ? '#f0fdf4' : 'transparent',
                            color: autoTTS ? '#16a34a' : '#94a3b8',
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        title={autoTTS ? '자동 음성 재생 ON' : '자동 음성 재생 OFF'}
                    >
                        <span style={{ fontSize: 14 }}>{autoTTS ? '🔊' : '🔇'}</span>
                        자동 음성 재생 {autoTTS ? 'ON' : 'OFF'}
                    </button>

                    {/* 📱 전화 모드 버튼 — 음성 데이터가 있는 AI만 표시 */}
                    {mentor?.voice_sample_url && (
                    <button
                        onClick={() => setVoiceCallOpen(true)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '5px 14px',
                            borderRadius: 20,
                            border: 'none',
                            background: 'transparent',
                            color: '#94a3b8',
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        title="음성 통화 모드"
                    >
                        <span style={{ fontSize: 14 }}>📞</span>
                        음성 대화
                    </button>
                    )}
                </div>

                {/* 📱 음성 통화 오버레이 */}
                {mentor && (
                    <VoiceCallOverlay
                        isOpen={voiceCallOpen}
                        onClose={() => setVoiceCallOpen(false)}
                        mentorName={mentor.name}
                        mentorEmoji={mentorEmoji}
                        mentorImage={mentorImage}
                        voiceSampleUrl={mentor.voice_sample_url}
                        voiceId={mentor.voice_id}
                        userName={userName}
                        onStreamMessage={async (text: string, onSentence: (s: string) => void, signal: AbortSignal) => {
                            // 🚀 실시간 스트리밍 파이프라인: LLM SSE → 문장 감지 즉시 콜백
                            const chatMessages = [
                                { role: 'system', content: `[음성 통화 모드] 지금은 전화 통화 중입니다. 반드시 다음 규칙을 따르세요:
1. 대답을 시작할 때 "아~", "음...", "네!", "아하", "오~", "맞아요!" 같은 자연스러운 추임새를 무조건 넣어줘.
2. 절대 두 문장 이상 길게 말하지 마. 한 문장 말하고 상대방의 대답을 유도해.
3. 이모지, 마크다운, 특수문자 절대 금지. 순수 텍스트만.
4. 문어체 금지. "~입니다", "~하겠습니다" 대신 "~해요", "~이에요" 같은 구어체만 써.
5. 상대방에게 질문을 던져서 대화를 이어가.` },
                                ...messages.slice(-MAX_CONTEXT_MESSAGES).map((m: { role: string; content: string }) => ({
                                    role: m.role,
                                    content: m.content,
                                })),
                                { role: 'user', content: text },
                            ]
                            const res = await fetch('/api/chat', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    mentorId: params?.mentorId,
                                    sessionId,
                                    messages: chatMessages,
                                }),
                                signal, // ⚡ 끼어들기 시 LLM 스트림 즉시 중단
                            })
                            if (!res.ok) throw new Error('AI 답변 실패')
                            const reader = res.body?.getReader()
                            if (!reader) throw new Error('스트림 없음')

                            let fullResponse = ''
                            let sentenceBuffer = '' // ⚡ 실시간 문장 버퍼
                            const decoder = new TextDecoder()
                            let sseBuffer = ''

                            while (true) {
                                const { done, value } = await reader.read()
                                if (done) break
                                sseBuffer += decoder.decode(value, { stream: true })
                                const lines = sseBuffer.split('\n')
                                sseBuffer = lines.pop() || ''

                                for (const line of lines) {
                                    if (line.startsWith('data: ')) {
                                        try {
                                            const json = JSON.parse(line.slice(6))
                                            const chunk = json.text || ''
                                            if (chunk) {
                                                fullResponse += chunk
                                                sentenceBuffer += chunk

                                                // ⚡ 한국어 문장 감지 — 3단계 전략
                                                // 1순위: 마침표/물음표/느낌표
                                                // 2순위: 한국어 종결어미(요/다/죠/네/까/지) + 공백/쉼표
                                                // 3순위: 40자 이상이면 쉼표(,)에서 분할
                                                let cutIndex = -1

                                                // 1순위: .?!。？！
                                                const punctMatch = sentenceBuffer.match(/[.!?。？！]/)
                                                if (punctMatch && punctMatch.index !== undefined) {
                                                    cutIndex = punctMatch.index + 1
                                                }

                                                // 2순위: 한국어 종결어미 + 공백/쉼표 (15자 이상일 때만)
                                                if (cutIndex === -1 && sentenceBuffer.length >= 15) {
                                                    const koEndMatch = sentenceBuffer.match(/[요다죠네까지세][,\s]/)
                                                    if (koEndMatch && koEndMatch.index !== undefined) {
                                                        cutIndex = koEndMatch.index + 1
                                                    }
                                                }

                                                // 3순위: 40자 이상이면 쉼표에서 분할
                                                if (cutIndex === -1 && sentenceBuffer.length >= 40) {
                                                    const commaIdx = sentenceBuffer.indexOf(',')
                                                    if (commaIdx > 10) cutIndex = commaIdx + 1
                                                }

                                                if (cutIndex > 0) {
                                                    const completeSentence = sentenceBuffer.slice(0, cutIndex).trim()
                                                    const remainder = sentenceBuffer.slice(cutIndex).trimStart()

                                                    // ⚡ 스마트 청킹: 15자 미만이면 전송하지 말고 다음 문장과 합침
                                                    if (completeSentence.length >= 15) {
                                                        sentenceBuffer = remainder
                                                        console.log('[Stream] 🎯 문장 전송:', completeSentence)
                                                        onSentence(completeSentence)
                                                    }
                                                    // 15자 미만이면 sentenceBuffer 그대로 유지 → 다음 청크와 합쳐짐
                                                }
                                            }
                                            if (json.fullResponse) {
                                                fullResponse = json.fullResponse
                                            }
                                        } catch { /* skip */ }
                                    }
                                }
                            }

                            // ⚡ 버퍼 flush: 마지막 남은 텍스트 강제 전송
                            if (sentenceBuffer.trim().length >= 2) {
                                console.log('[Stream] 🔚 버퍼 flush:', sentenceBuffer.trim())
                                onSentence(sentenceBuffer.trim())
                            }

                            return fullResponse
                        }}
                    />
                )}

                {/* ElevenLabs 음성 대화 오버레이 */}
                {mentor?.name && ELEVENLABS_AGENT_IDS[mentor.name] && (
                    <ElevenLabsWidget
                        agentId={ELEVENLABS_AGENT_IDS[mentor.name]}
                        mentorName={mentor.name}
                        mentorImage={mentorImage}
                        mentorEmoji={mentorEmoji}
                        isOpen={isCallOpen}
                        onClose={() => setIsCallOpen(false)}
                    />
                )}

                <style>{`
                @keyframes spin { to { transform: rotate(360deg) } }
                @keyframes pulseSoft { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>

                {/* 마케팅 수신 동의 2차 터치 팝업 */}
                {showMarketingPopup && (
                    <MarketingConsentPopup
                        onAccept={handleMarketingAccept}
                        onDismiss={handleMarketingDismiss}
                    />
                )}
            </div>{/* flex: 메인 채팅 영역 끝 */}
        </div>
    )
}
