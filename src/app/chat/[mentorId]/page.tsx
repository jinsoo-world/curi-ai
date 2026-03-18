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

/** 📊 비회원 식별용 고유 ID 생성 (localStorage 기반) */
function getVisitorId(): string {
    if (typeof window === 'undefined') return ''
    const key = 'curi_visitor_id'
    let vid = localStorage.getItem(key)
    if (!vid) {
        vid = crypto.randomUUID()
        localStorage.setItem(key, vid)
    }
    return vid
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
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [showLoginGate, setShowLoginGate] = useState(false)
    const [showVoiceSample, setShowVoiceSample] = useState(false)
    const voiceSampleAudioRef = useRef<HTMLAudioElement | null>(null)
    const [isReportNew, setIsReportNew] = useState(false)
    const reportShownRef = useRef(false)

    const [userName, setUserName] = useState('')

    // AI 답변 총 글자수 계산
    const aiContentLength = messages
        .filter(m => m.role === 'assistant')
        .reduce((sum, m) => sum + (m.content?.length || 0), 0)

    // 프로필에서 autoTTS 설정 + 유저 이름 로드
    useEffect(() => {
        async function loadProfile() {
            try {
                const res = await fetch('/api/profile')
                if (res.ok) {
                    const data = await res.json()
                    if (data?.profile?.auto_tts) setAutoTTS(true)
                    const name = data?.google_name || data?.profile?.name || data?.profile?.google_name || ''
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
                setIsLoggedIn(isLoggedIn)
            } catch {
                isLoggedIn = false
                setIsLoggedIn(false)
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

            // ?new=true가 아니어도 → 항상 새 세션으로 시작 (프로필+질문 3개 표시)
            // 기존 대화가 있으면 사이드바 자동 열기
            if (!isNewChatRequested) {
                try {
                    const res = await fetch(`/api/sessions?mentorId=${mentorId}`)
                    const { sessions } = await res.json()
                    if (sessions?.length > 0) {
                        // 기존 대화 존재 → 사이드바 열기 (데스크탑에서)
                        setIsSidebarOpen(true)
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
    const sendMessage = useCallback(async (content: string, inputMethod: 'text' | 'stt' = 'text') => {
        if (!content.trim() || isStreaming) return

        // 🔒 비회원 3턴 체크 (전체 멘토 합산)
        if (!isLoggedIn) {
            const totalGuestMsgs = getGuestMessageCount()
            if (totalGuestMsgs >= 3) {
                setShowLoginGate(true)
                return
            }
        }

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
                    inputMethod,
                    visitorId: isGuest ? getVisitorId() : undefined,
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

    // ───── 멘토 매칭에서 전달된 auto_msg 자동 전송 ─────
    const autoMsgSent = useRef(false)
    useEffect(() => {
        if (autoMsgSent.current) return
        const autoMsg = searchParams.get('auto_msg')
        if (!autoMsg || !mentor || !sessionId) return
        autoMsgSent.current = true
        const decoded = decodeURIComponent(autoMsg)
        window.history.replaceState(null, '', `/chat/${mentorId}?session=${sessionId}`)
        setTimeout(() => sendMessage(decoded), 500)
    }, [mentor, sessionId, searchParams, mentorId, sendMessage])

    // ───── 리포트 안내: AI 답변 1500자 넘으면 인챗 안내 카드 1회 삽입 ─────
    useEffect(() => {
        if (reportShownRef.current) return
        if (!isLoggedIn || !sessionId || sessionId.startsWith('guest-')) return
        if (aiContentLength >= 1500 && !isStreaming) {
            reportShownRef.current = true
            setIsReportNew(true)
            setMessages(prev => [
                ...prev,
                {
                    id: `report-prompt-${Date.now()}`,
                    role: 'system' as const,
                    content: '__REPORT_PROMPT__',
                    createdAt: new Date().toISOString(),
                },
            ])
            // 10초 후 NEW 뱃지 자동 해제
            setTimeout(() => setIsReportNew(false), 10000)
        }
    }, [aiContentLength, isStreaming, isLoggedIn, sessionId])

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
                    onCall={mentor.voice_sample_url ? () => {
                        if (!isLoggedIn) {
                            setShowVoiceSample(true)
                            return
                        }
                        setVoiceCallOpen(true)
                    } : undefined}
                    onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                    isSidebarOpen={isSidebarOpen}
                    sessionId={sessionId}
                    aiContentLength={aiContentLength}
                    isReportNew={isReportNew}
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
                                        onClick={() => {
                                            if (!isLoggedIn) {
                                                setShowVoiceSample(true)
                                                return
                                            }
                                            setVoiceCallOpen(true)
                                        }}
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
                            voiceId={mentor.voice_id}
                        />



                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* 🔥 후속 질문 제안 칩 — AI 응답 후 대화 유도 */}
                {messages.length > 0 && showSuggestions && suggestions.length > 0 && !isStreaming && (
                    <div style={{
                        padding: '8px 16px 4px',
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                        animation: 'slideUp 0.3s ease',
                    }}>
                        {suggestions.slice(0, 3).map((q, i) => (
                            <button
                                key={i}
                                onClick={() => sendMessage(q)}
                                style={{
                                    padding: '8px 14px',
                                    borderRadius: 20,
                                    border: '1px solid #d1fae5',
                                    background: '#f0fdf4',
                                    color: '#16a34a',
                                    fontSize: 13,
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s',
                                    maxWidth: '90%',
                                    textOverflow: 'ellipsis',
                                    overflow: 'hidden',
                                    whiteSpace: 'nowrap',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.background = '#dcfce7'
                                    e.currentTarget.style.borderColor = '#22c55e'
                                    e.currentTarget.style.transform = 'translateY(-1px)'
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.background = '#f0fdf4'
                                    e.currentTarget.style.borderColor = '#d1fae5'
                                    e.currentTarget.style.transform = 'translateY(0)'
                                }}
                            >
                                ✦ {q}
                            </button>
                        ))}
                    </div>
                )}



                <ChatInput
                    value={input}
                    onChange={setInput}
                    onSubmit={sendMessage}
                    isStreaming={isStreaming}
                />



                {/* 🔊 비회원 음성 샘플 모달 */}
                {showVoiceSample && mentor && (
                    <div
                        onClick={() => { setShowVoiceSample(false); voiceSampleAudioRef.current?.pause() }}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 9999,
                            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <div
                            onClick={e => e.stopPropagation()}
                            style={{
                                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                                borderRadius: 24, padding: '36px 32px', maxWidth: 380, width: '90%',
                                textAlign: 'center', position: 'relative', overflow: 'hidden',
                            }}
                        >
                            {/* 배경 글로우 */}
                            <div style={{
                                position: 'absolute', top: -50, right: -50,
                                width: 140, height: 140, borderRadius: '50%',
                                background: 'radial-gradient(circle, rgba(34,197,94,0.12) 0%, transparent 70%)',
                            }} />

                            <div style={{ fontSize: 48, marginBottom: 16 }}>
                                {mentorImage ? (
                                    <img src={mentorImage} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
                                ) : mentorEmoji || '🎙️'}
                            </div>
                            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
                                {mentor.name}의 목소리를 들어보세요
                            </div>
                            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, lineHeight: 1.6 }}>
                                AI가 복제한 진짜 목소리로 대화할 수 있어요
                            </div>

                            {/* 오디오 플레이어 */}
                            {mentor.voice_sample_url && (
                                <div style={{
                                    background: 'rgba(255,255,255,0.06)', borderRadius: 16,
                                    padding: '16px 20px', marginBottom: 24,
                                }}>
                                    <audio
                                        ref={voiceSampleAudioRef}
                                        src={mentor.voice_sample_url}
                                        controls
                                        autoPlay
                                        style={{ width: '100%', height: 40 }}
                                        onEnded={() => {}}
                                    />
                                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                                        🎧 멘토의 실제 목소리 샘플
                                    </div>
                                </div>
                            )}

                            {/* 혜택 + CTA */}
                            <div style={{
                                display: 'flex', flexDirection: 'column', gap: 8,
                                marginBottom: 20, textAlign: 'left',
                                background: 'rgba(255,255,255,0.04)',
                                borderRadius: 12, padding: '14px 16px',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0' }}>
                                    <span>📞</span> 이 목소리로 <strong style={{ color: '#4ade80' }}>직접 통화</strong> 가능
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0' }}>
                                    <span>💬</span> 매일 <strong style={{ color: '#4ade80' }}>무제한</strong> 텍스트 대화
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0' }}>
                                    <span>📝</span> 대화 기록 <strong style={{ color: '#4ade80' }}>영구 저장</strong>
                                </div>
                            </div>

                            <a
                                href="/login"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 8,
                                    padding: '14px 36px',
                                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                                    color: '#fff', borderRadius: 14, fontSize: 16, fontWeight: 800,
                                    textDecoration: 'none',
                                    boxShadow: '0 4px 20px rgba(34,197,94,0.4)',
                                    transition: 'transform 0.15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                🚀 무료 가입하고 전화하기
                            </a>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 12 }}>
                                ✓ 30초 가입 ✓ 카드 불필요 ✓ 언제든 탈퇴
                            </div>

                            {/* 닫기 */}
                            <button
                                onClick={() => { setShowVoiceSample(false); voiceSampleAudioRef.current?.pause() }}
                                style={{
                                    position: 'absolute', top: 12, right: 12,
                                    background: 'rgba(255,255,255,0.1)', border: 'none',
                                    borderRadius: '50%', width: 32, height: 32,
                                    color: '#94a3b8', fontSize: 18, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                            >×</button>
                        </div>
                    </div>
                )}

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
                            // 📝 사용자 발화를 채팅에 추가
                            const userMsg: ChatMessage = { id: `voice-user-${Date.now()}`, role: 'user', content: text, createdAt: new Date().toISOString() }
                            setMessages(prev => [...prev, userMsg])

                            // 🚀 실시간 스트리밍 파이프라인: LLM SSE → 문장 감지 즉시 콜백
                            const chatMessages = [
                                { role: 'system', content: `[음성 통화 모드] 지금은 전화 통화 중입니다. 반드시 다음 규칙을 따르세요:
1. 대답을 시작할 때 "아~", "음...", "네!", "아하", "오~" 같은 자연스러운 추임새를 넣어줘.
2. 절대 두 문장 이상 길게 말하지 마. 한 문장 말하고 상대방의 대답을 유도해.
3. 이모지, 마크다운, 특수문자, 볼드 절대 금지. 순수 텍스트만.
4. 당신의 고유 말투와 캐릭터를 반드시 유지해. 사극체면 사극체, 반말이면 반말 그대로 유지.
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
                                    inputMethod: 'voice_call',
                                    visitorId: (!sessionId || sessionId.startsWith('guest-')) ? getVisitorId() : undefined,
                                }),
                                signal, // ⚡ 끼어들기 시 LLM 스트림 즉시 중단
                            })
                            if (!res.ok) throw new Error('AI 답변 실패')
                            const reader = res.body?.getReader()
                            if (!reader) throw new Error('스트림 없음')

                            let fullResponse = ''
                            let sentenceBuffer = ''
                            let isFirstSentence = true // ⚡ 동적 청킹: 첫 문장 즉시 발사
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

                                                // ⚡ 한국어 문장 감지 — 3단계
                                                let cutIndex = -1

                                                // 1순위: .?!。？！
                                                const punctMatch = sentenceBuffer.match(/[.!?。？！]/)
                                                if (punctMatch && punctMatch.index !== undefined) {
                                                    cutIndex = punctMatch.index + 1
                                                }

                                                // 2순위: 한국어 종결어미 + 공백/쉼표 (15자 이상)
                                                if (cutIndex === -1 && sentenceBuffer.length >= 15) {
                                                    const koEndMatch = sentenceBuffer.match(/[요다죠네까지세][,\s]/)
                                                    if (koEndMatch && koEndMatch.index !== undefined) {
                                                        cutIndex = koEndMatch.index + 1
                                                    }
                                                }

                                                // 3순위: 40자 이상이면 쉼표
                                                if (cutIndex === -1 && sentenceBuffer.length >= 40) {
                                                    const commaIdx = sentenceBuffer.indexOf(',')
                                                    if (commaIdx > 10) cutIndex = commaIdx + 1
                                                }

                                                if (cutIndex > 0) {
                                                    const completeSentence = sentenceBuffer.slice(0, cutIndex).trim()
                                                    const remainder = sentenceBuffer.slice(cutIndex).trimStart()

                                                    if (isFirstSentence) {
                                                        // ⚡ 첫 문장: 길이 무관 즉시 발사!
                                                        if (completeSentence.length >= 2) {
                                                            sentenceBuffer = remainder
                                                            isFirstSentence = false
                                                            console.log('[Stream] 🚀 첫 문장 즉시:', completeSentence)
                                                            onSentence(completeSentence)
                                                        }
                                                    } else {
                                                        // ⚡ 두 번째부터: 15자 이상만 전송 (API 호출 절감)
                                                        if (completeSentence.length >= 15) {
                                                            sentenceBuffer = remainder
                                                            console.log('[Stream] 🎯 문장 전송:', completeSentence)
                                                            onSentence(completeSentence)
                                                        }
                                                        // 15자 미만이면 버퍼 유지 → 다음과 합침
                                                    }
                                                }
                                            }
                                            if (json.fullResponse) {
                                                fullResponse = json.fullResponse
                                            }
                                        } catch { /* skip */ }
                                    }
                                }
                            }

                            // ⚡ 마지막 flush: 길이 무관, 남은 텍스트 전부 전송
                            if (sentenceBuffer.trim().length >= 2) {
                                console.log('[Stream] 🔚 flush:', sentenceBuffer.trim())
                                onSentence(sentenceBuffer.trim())
                            }

                            // 📝 AI 응답을 채팅에 추가
                            if (fullResponse.trim()) {
                                const assistantMsg: ChatMessage = { id: `voice-ai-${Date.now()}`, role: 'assistant', content: fullResponse, createdAt: new Date().toISOString() }
                                setMessages(prev => [...prev, assistantMsg])
                            }

                            return fullResponse
                        }}
                    />
                )}

                {/* 🔒 비회원 3턴 로그인 유도 모달 */}
                {showLoginGate && (
                    <>
                        <div
                            onClick={() => setShowLoginGate(false)}
                            style={{
                                position: 'fixed',
                                inset: 0,
                                background: 'rgba(0,0,0,0.5)',
                                zIndex: 2000,
                                animation: 'shareOverlayIn 0.2s ease',
                            }}
                        />
                        <div style={{
                            position: 'fixed',
                            left: '50%',
                            top: '50%',
                            transform: 'translate(-50%, -50%)',
                            background: '#fff',
                            borderRadius: 24,
                            padding: '36px 28px 28px',
                            width: 'min(380px, calc(100vw - 40px))',
                            zIndex: 2001,
                            textAlign: 'center',
                            animation: 'shareModalIn 0.25s ease',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                        }}>
                            {/* 아이콘 */}
                            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
                            <h3 style={{
                                margin: '0 0 8px',
                                fontSize: 20,
                                fontWeight: 700,
                                color: '#1e293b',
                            }}>
                                무료 체험이 끝났어요!
                            </h3>
                            <p style={{
                                margin: '0 0 24px',
                                fontSize: 14,
                                color: '#64748b',
                                lineHeight: 1.6,
                            }}>
                                회원가입하면 더 많은 AI 멘토와<br />
                                무제한 대화할 수 있어요 ✨
                            </p>
                            {/* 구글 로그인 버튼 */}
                            <button
                                onClick={() => {
                                    window.location.href = '/login'
                                }}
                                style={{
                                    width: '100%',
                                    padding: '14px 20px',
                                    borderRadius: 14,
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    color: '#fff',
                                    fontSize: 16,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'transform 0.15s, box-shadow 0.15s',
                                    boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                                    marginBottom: 10,
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-1px)'
                                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(34,197,94,0.4)'
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'translateY(0)'
                                    e.currentTarget.style.boxShadow = '0 4px 14px rgba(34,197,94,0.3)'
                                }}
                            >
                                🚀 무료 회원가입하기
                            </button>
                        </div>
                    </>
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
