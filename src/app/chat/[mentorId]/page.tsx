'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { MentorHeader, ChatMessages, ChatInput, SuggestionCards, ElevenLabsWidget, InsightCard } from './components'
import type { ChatMessage } from './components'

interface MentorData {
    id: string
    name: string
    slug: string
    title: string
    avatar_url: string | null
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
    const [insights, setInsights] = useState<any[]>([])
    const [isGeneratingInsight, setIsGeneratingInsight] = useState(false)

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

            // URL에 ?session=xxx가 있으면 기존 세션 + 메시지 로드
            if (existingSessionId && !existingSessionId.startsWith('guest-')) {
                setSessionId(existingSessionId)
                try {
                    const res = await fetch(`/api/sessions/${existingSessionId}/messages`)
                    const { messages: loaded } = await res.json()
                    if (loaded?.length) {
                        setMessages(loaded)
                        setShowSuggestions(false)
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
                        }
                        // URL 업데이트 (히스토리 교체, 새로고침 없음)
                        window.history.replaceState(null, '', `/chat/${mentorId}?session=${lastSession.id}`)
                        return
                    }
                } catch (e) {
                    console.error('기존 세션 조회 실패:', e)
                }
            }

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
                }
            } catch (e) {
                console.error('세션 생성 실패:', e)
            }
        }
        initSession()
    }, [mentorId, existingSessionId, isNewChatRequested])

    // ───── 스크롤 ─────
    useEffect(() => {
        scrollToBottom()
    }, [messages, scrollToBottom])

    // ───── 추천 질문 ─────
    const fetchSuggestions = useCallback(async (currentMessages: ChatMessage[]) => {
        try {
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
                setSuggestions(data.suggestions)
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
        }

        const assistantId = `assistant-${now}`
        const baseMessages: ChatMessage[] = [...messages, userMessage]

        // 빈 어시스턴트 메시지 추가 (타이핑 인디케이터 표시)
        setMessages([...baseMessages, { id: assistantId, role: 'assistant', content: '' }])
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
                                    { id: assistantId, role: 'assistant', content: updatedContent },
                                ])
                            }
                            if (data.done) {
                                setIsStreaming(false)
                                const finalMessages: ChatMessage[] = [
                                    ...baseMessages,
                                    { id: assistantId, role: 'assistant', content: fullContent },
                                ]
                                setMessages(finalMessages)
                                fetchSuggestions(finalMessages)
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
                    { id: assistantId, role: 'assistant', content: fullContent },
                ])
            }
            // 비로그인 사용자: localStorage 카운트 증가
            if (isGuest) incrementGuestMessageCount()
            setIsStreaming(false)
        } catch (error) {
            console.error('Chat error:', error)
            setMessages([
                ...baseMessages,
                { id: assistantId, role: 'assistant', content: '앗, 잠깐 문제가 생겼어요. 다시 한번 말씀해주실래요?' },
            ])
            setIsStreaming(false)
        }
    }, [isStreaming, lastSentAt, messages, mentorId, sessionId, fetchSuggestions])

    // ───── 인사이트 생성 ─────
    const generateInsight = useCallback(async () => {
        if (isGeneratingInsight || messages.length < 4 || !sessionId || !mentor) return
        setIsGeneratingInsight(true)
        try {
            const res = await fetch('/api/insights', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    mentorId,
                    mentorName: mentor.name,
                    messages: messages.map(m => ({ role: m.role, content: m.content })),
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                alert(data.error || '인사이트 생성에 실패했어요. 잠시 후 다시 시도해주세요.')
                return
            }
            if (data.insight) {
                setInsights(prev => [data.insight, ...prev])
            }
        } catch (err) {
            console.error('Insight generation error:', err)
            alert('네트워크 오류가 발생했어요. 인터넷 연결을 확인해주세요.')
        } finally {
            setIsGeneratingInsight(false)
        }
    }, [isGeneratingInsight, messages, sessionId, mentorId, mentor])

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
            }
        } catch (e) {
            console.error('새 세션 생성 실패:', e)
        }
    }, [mentor, mentorId])

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

    const mentorImage = MENTOR_IMAGES[mentor.name]
    const mentorEmoji = MENTOR_EMOJI[mentor.slug] || '🎓'

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100dvh',
            background: '#faf8f5',
        }}>
            <MentorHeader
                mentor={mentor}
                mentorImage={mentorImage}
                mentorEmoji={mentorEmoji}
                isStreaming={isStreaming}
                onNewChat={handleNewChat}
                onCall={ELEVENLABS_AGENT_IDS[mentor.name] ? () => setIsCallOpen(true) : undefined}
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
                <div style={{
                    width: '100%',
                    maxWidth: 860,
                    padding: '24px clamp(16px, 4vw, 32px)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 24,
                }}>
                    {/* 멘토 인사 카드 — 대화가 없을 때 */}
                    {messages.length === 0 && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            padding: '48px 20px 32px',
                        }}>
                            {mentorImage ? (
                                <img
                                    src={mentorImage}
                                    alt={mentor.name}
                                    style={{
                                        width: 88,
                                        height: 88,
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        marginBottom: 16,
                                        boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                                    }}
                                />
                            ) : (
                                <div style={{
                                    width: 88,
                                    height: 88,
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 44,
                                    marginBottom: 16,
                                    boxShadow: '0 4px 16px rgba(34,197,94,0.2)',
                                }}>
                                    {mentorEmoji}
                                </div>
                            )}
                            <h2 style={{
                                margin: 0,
                                fontSize: 28,
                                fontWeight: 800,
                                color: '#18181b',
                                marginBottom: 4,
                            }}>
                                {mentor.name}
                            </h2>
                            <p style={{
                                margin: 0,
                                fontSize: 18,
                                color: '#71717a',
                                marginBottom: 24,
                            }}>
                                {mentor.title}
                            </p>

                            {/* 인사 메시지 */}
                            <div style={{
                                background: '#f0ede8',
                                borderRadius: '20px',
                                padding: '18px 24px',
                                fontSize: 19,
                                color: '#18181b',
                                lineHeight: 1.7,
                                textAlign: 'left',
                                maxWidth: 600,
                            }}>
                                {mentor.greeting_message}
                            </div>

                            {showSuggestions && (
                                <SuggestionCards
                                    suggestions={suggestions}
                                    onSelect={sendMessage}
                                    variant="welcome"
                                />
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
                    />

                    {/* 대화 중 추천 질문 */}
                    {!isStreaming && messages.length > 0 && showSuggestions && (
                        <SuggestionCards
                            suggestions={suggestions}
                            onSelect={sendMessage}
                            variant="inline"
                        />
                    )}

                    {/* 인사이트 생성 버튼 — 4턴 이상 + 로그인 사용자 */}
                    {!isStreaming && messages.length >= 4 && sessionId && !sessionId.startsWith('guest-') && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'center',
                            padding: '8px 0',
                        }}>
                            <button
                                onClick={generateInsight}
                                disabled={isGeneratingInsight}
                                style={{
                                    background: isGeneratingInsight
                                        ? 'linear-gradient(135deg, #e0e7ff, #ede9fe)'
                                        : 'linear-gradient(135deg, #eef2ff, #faf5ff)',
                                    border: '1px solid rgba(99,102,241,0.15)',
                                    borderRadius: 24,
                                    padding: '10px 20px',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    color: '#6366f1',
                                    cursor: isGeneratingInsight ? 'default' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    transition: 'all 0.2s',
                                    opacity: isGeneratingInsight ? 0.7 : 1,
                                }}
                            >
                                {isGeneratingInsight ? (
                                    <>
                                        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                                        인사이트 추출 중...
                                    </>
                                ) : (
                                    <>
                                        💡 이 대화의 인사이트 추출
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* 생성된 인사이트 카드 */}
                    {insights.map(insight => (
                        <InsightCard key={insight.id} insight={insight} />
                    ))}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            <ChatInput
                value={input}
                onChange={setInput}
                onSubmit={sendMessage}
                isStreaming={isStreaming}
            />

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
        </div>
    )
}
