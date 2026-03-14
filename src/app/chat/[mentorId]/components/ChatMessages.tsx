'use client'

import { useState, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface ChatMessage {
    id: string
    role: 'user' | 'assistant'
    content: string
    createdAt?: string
}

interface ChatMessagesProps {
    messages: ChatMessage[]
    mentor: {
        name: string
        slug: string
    }
    mentorImage: string | undefined
    mentorEmoji: string
    isStreaming: boolean
}

/* ── 스피커 아이콘 ── */
const SpeakerIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3L4.5 5.5H2v5h2.5L8 13V3z" />
        <path d="M11 5.5a3.5 3.5 0 010 5" />
        <path d="M13 3.5a6.5 6.5 0 010 9" />
    </svg>
)
const StopIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <rect x="3" y="3" width="10" height="10" rx="2" />
    </svg>
)
const SpinnerIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6" opacity="0.25" />
        <path d="M14 8a6 6 0 01-6 6" strokeLinecap="round">
            <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.8s" repeatCount="indefinite" />
        </path>
    </svg>
)

/** TTS 음성 재생 버튼 */
function TTSButton({ message, mentorName }: { message: ChatMessage; mentorName: string }) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'playing'>('idle')
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const cacheRef = useRef<Map<string, string>>(new Map())

    const handleTTS = useCallback(async () => {
        // 재생 중이면 정지
        if (status === 'playing' && audioRef.current) {
            audioRef.current.pause()
            audioRef.current.currentTime = 0
            setStatus('idle')
            return
        }

        // 로딩 중이면 무시
        if (status === 'loading') return

        setStatus('loading')

        try {
            // 캐시 확인
            let audioUrl = cacheRef.current.get(message.id)

            if (!audioUrl) {
                const res = await fetch('/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: message.content.slice(0, 500),
                        mentorName,
                    }),
                })

                if (!res.ok) {
                    const err = await res.json()
                    throw new Error(err.error || '음성 생성 실패')
                }

                const data = await res.json()
                audioUrl = data.audioUrl
                if (audioUrl) cacheRef.current.set(message.id, audioUrl)
            }

            if (!audioUrl) throw new Error('음성 URL 없음')

            // 오디오 재생
            const audio = new Audio(audioUrl)
            audioRef.current = audio
            audio.onended = () => setStatus('idle')
            audio.onerror = () => setStatus('idle')
            await audio.play()
            setStatus('playing')
        } catch (err) {
            console.error('[TTS Error]', err)
            setStatus('idle')
        }
    }, [status, message.id, message.content, mentorName])

    return (
        <button
            onClick={handleTTS}
            disabled={status === 'loading'}
            style={{
                background: 'none', border: 'none', cursor: status === 'loading' ? 'wait' : 'pointer',
                padding: '6px 8px', borderRadius: 8,
                color: status === 'playing' ? '#22c55e' : status === 'loading' ? '#cbd5e1' : '#94a3b8',
                display: 'flex', alignItems: 'center',
                transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => { if (status !== 'loading') e.currentTarget.style.background = '#f1f5f9' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            title={status === 'playing' ? '정지' : status === 'loading' ? '음성 생성 중...' : '음성으로 듣기'}
            aria-label="음성 재생"
        >
            {status === 'loading' ? <SpinnerIcon /> : status === 'playing' ? <StopIcon /> : <SpeakerIcon />}
        </button>
    )
}

/* ── SVG 아이콘 ── */
const CopyIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="5" width="9" height="9" rx="1.5" />
        <path d="M5 11H3.5A1.5 1.5 0 012 9.5V3.5A1.5 1.5 0 013.5 2h6A1.5 1.5 0 0111 3.5V5" />
    </svg>
)
const CheckIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 8.5L6.5 12L13 4" />
    </svg>
)
const ThumbUpIcon = ({ filled }: { filled: boolean }) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 14H3a1 1 0 01-1-1V8a1 1 0 011-1h2m0 7V7m0 7h6.28a2 2 0 001.94-1.53l1.07-4.27A1 1 0 0013.32 7H10V3.5A1.5 1.5 0 008.5 2L5 7" />
    </svg>
)
const ThumbDownIcon = ({ filled }: { filled: boolean }) => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 2H13a1 1 0 011 1v5a1 1 0 01-1 1h-2m0-7v7m0-7H4.72a2 2 0 00-1.94 1.53l-1.07 4.27A1 1 0 002.68 9H6v3.5A1.5 1.5 0 007.5 14L11 9" />
    </svg>
)

/** 복사/음성재생/좋아요/아쉬워요 액션 아이콘 — 제미나이 스타일 작은 아이콘 */
function MessageActions({ message, mentorName }: { message: ChatMessage; mentorName?: string }) {
    const [copied, setCopied] = useState(false)
    const [feedback, setFeedback] = useState<'like' | 'dislike' | null>(null)
    const isAssistant = message.role === 'assistant'

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(message.content)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            const textarea = document.createElement('textarea')
            textarea.value = message.content
            document.body.appendChild(textarea)
            textarea.select()
            document.execCommand('copy')
            document.body.removeChild(textarea)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }, [message.content])

    const handleFeedback = useCallback(async (type: 'like' | 'dislike') => {
        const newFeedback = feedback === type ? null : type
        setFeedback(newFeedback)
        try {
            await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId: message.id, feedbackType: newFeedback }),
            })
        } catch { /* silent */ }
    }, [feedback, message.id])

    return (
        <div style={{
            display: 'flex',
            gap: 2,
            marginTop: 8,
            opacity: 0,
            transition: 'opacity 0.2s',
            justifyContent: isAssistant ? 'flex-start' : 'flex-end',
        }}
            className="msg-actions"
        >
            <button
                onClick={handleCopy}
                style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '6px 8px', borderRadius: 8,
                    color: copied ? '#22c55e' : '#94a3b8',
                    display: 'flex', alignItems: 'center', gap: 4,
                    transition: 'color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                title="복사"
                aria-label="메시지 복사"
            >
                {copied ? <CheckIcon /> : <CopyIcon />}
            </button>
            {isAssistant && (
                <>
                    <TTSButton message={message} mentorName={mentorName || ''} />
                    <button
                        onClick={() => handleFeedback('like')}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '6px 8px', borderRadius: 8,
                            color: feedback === 'like' ? '#22c55e' : '#94a3b8',
                            display: 'flex', alignItems: 'center',
                            transition: 'color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                        title="좋아요"
                        aria-label="좋아요 피드백"
                    >
                        <ThumbUpIcon filled={feedback === 'like'} />
                    </button>
                    <button
                        onClick={() => handleFeedback('dislike')}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '6px 8px', borderRadius: 8,
                            color: feedback === 'dislike' ? '#ef4444' : '#94a3b8',
                            display: 'flex', alignItems: 'center',
                            transition: 'color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                        title="아쉬워요"
                        aria-label="아쉬워요 피드백"
                    >
                        <ThumbDownIcon filled={feedback === 'dislike'} />
                    </button>
                </>
            )}
        </div>
    )
}

/** 마크다운 렌더링 — 제미나이 스타일 넓은 본문 */
function MarkdownContent({ content }: { content: string }) {
    return (
        <div className="chat-markdown">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) => (
                        <p style={{ margin: '0 0 12px 0', lineHeight: 1.8 }}>{children}</p>
                    ),
                    strong: ({ children }) => (
                        <strong style={{ fontWeight: 700, color: '#1e293b' }}>{children}</strong>
                    ),
                    ul: ({ children }) => (
                        <ul style={{ margin: '6px 0 12px 0', paddingLeft: 20 }}>{children}</ul>
                    ),
                    ol: ({ children }) => (
                        <ol style={{ margin: '6px 0 12px 0', paddingLeft: 20 }}>{children}</ol>
                    ),
                    li: ({ children }) => (
                        <li style={{ marginBottom: 6, lineHeight: 1.7 }}>{children}</li>
                    ),
                    code: ({ children, className }) => {
                        const isInline = !className
                        return isInline ? (
                            <code style={{
                                background: '#f1f5f9',
                                padding: '2px 6px',
                                borderRadius: 5,
                                fontSize: '0.88em',
                                fontFamily: "'SF Mono', 'Fira Code', monospace",
                                color: '#334155',
                            }}>{children}</code>
                        ) : (
                            <code style={{
                                display: 'block',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                padding: 14,
                                borderRadius: 10,
                                fontSize: '0.85em',
                                overflowX: 'auto',
                                margin: '10px 0',
                                fontFamily: "'SF Mono', 'Fira Code', monospace",
                            }}>{children}</code>
                        )
                    },
                    blockquote: ({ children }) => (
                        <blockquote style={{
                            borderLeft: '3px solid #22c55e',
                            paddingLeft: 14,
                            margin: '10px 0',
                            color: '#64748b',
                        }}>{children}</blockquote>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    )
}

/** 타이핑 인디케이터 — 제미나이 스타일 부드러운 펄스 */
function TypingIndicator() {
    return (
        <span style={{
            display: 'inline-flex',
            gap: 5,
            alignItems: 'center',
            padding: '4px 0',
        }}>
            {[0, 1, 2].map(i => (
                <span key={i} style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: '#94a3b8',
                    animation: `geminiDot 1.4s ease-in-out ${i * 0.2}s infinite`,
                }} />
            ))}
            <style>{`
                @keyframes geminiDot {
                    0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
                    40% { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </span>
    )
}

/** 시간 포맷 — 오후 4:04 형태 */
function formatTime(dateStr?: string): string {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true })
}

/** 날짜 구분선 텍스트 — 📅 2026년 3월 8일 일요일 */
function formatDateSeparator(dateStr: string): string {
    const d = new Date(dateStr)
    return d.toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    })
}

/** 같은 날짜인지 비교 */
function isSameDay(a?: string, b?: string): boolean {
    if (!a || !b) return false
    const da = new Date(a)
    const db = new Date(b)
    return da.getFullYear() === db.getFullYear() &&
        da.getMonth() === db.getMonth() &&
        da.getDate() === db.getDate()
}

export default function ChatMessages({
    messages,
    mentor,
    mentorImage,
    mentorEmoji,
    isStreaming,
}: ChatMessagesProps) {
    return (
        <>
            {messages.map((msg, idx) => {
                const isUser = msg.role === 'user'
                const isEmptyAssistant = !isUser && !msg.content
                const prevMsg = idx > 0 ? messages[idx - 1] : null
                const showDateSeparator = msg.createdAt && !isSameDay(prevMsg?.createdAt, msg.createdAt)
                const timeStr = formatTime(msg.createdAt)

                return (
                    <div key={msg.id}>
                        {/* 날짜 구분선 */}
                        {showDateSeparator && msg.createdAt && (
                            <div style={{
                                display: 'flex', justifyContent: 'center',
                                margin: idx === 0 ? '0 0 20px' : '16px 0 20px',
                            }}>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '6px 16px',
                                    borderRadius: 20,
                                    background: '#f1f5f9',
                                    color: '#64748b',
                                    fontSize: 13,
                                    fontWeight: 500,
                                }}>
                                    📅 {formatDateSeparator(msg.createdAt)}
                                </span>
                            </div>
                        )}

                        <div
                            className="msg-row"
                            style={{
                                display: 'flex',
                                flexDirection: isUser ? 'row-reverse' : 'row',
                                alignItems: 'flex-start',
                                gap: 14,
                                animation: 'msgFadeIn 0.3s ease-out',
                            }}
                        >
                            {/* 멘토 아바타 — 작고 깔끔하게 */}
                            {!isUser && (
                                mentorImage ? (
                                    <img
                                        src={mentorImage}
                                        alt={mentor.name}
                                        style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: '50%',
                                            objectFit: 'cover',
                                            flexShrink: 0,
                                            marginTop: 2,
                                        }}
                                    />
                                ) : (
                                    <img
                                        src="/logo.png"
                                        alt="큐리 AI"
                                        style={{
                                            width: 36,
                                            height: 36,
                                            borderRadius: '50%',
                                            objectFit: 'cover',
                                            flexShrink: 0,
                                            marginTop: 2,
                                        }}
                                    />
                                )
                            )}

                            {/* 이름 + 메시지 + 시간 + 액션 */}
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                maxWidth: isUser ? '75%' : '80%',
                                minWidth: 0,
                            }}>
                                {/* 멘토 이름 — 간결하게 */}
                                {!isUser && (
                                    <div style={{
                                        fontSize: 14,
                                        fontWeight: 600,
                                        color: '#64748b',
                                        marginBottom: 6,
                                        letterSpacing: '-0.01em',
                                    }}>
                                        {mentor.name}
                                    </div>
                                )}

                                {/* 메시지 본문 */}
                                <div style={{
                                    ...(isUser ? {
                                        padding: '12px 18px',
                                        borderRadius: '20px 20px 6px 20px',
                                        background: '#22c55e',
                                        color: '#fff',
                                        fontSize: 15,
                                        lineHeight: 1.7,
                                        wordBreak: 'break-word' as const,
                                    } : {
                                        padding: '4px 0',
                                        color: '#1e293b',
                                        fontSize: 15,
                                        lineHeight: 1.8,
                                        wordBreak: 'break-word' as const,
                                    }),
                                }}>
                                    {isEmptyAssistant ? (
                                        <TypingIndicator />
                                    ) : isUser ? (
                                        <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                                    ) : msg.content.includes('__GUEST_LOGIN_CTA__') ? (
                                        <>
                                            <MarkdownContent content={msg.content.replace('__GUEST_LOGIN_CTA__', '')} />
                                            {/* 🔥 로그인 유도 카드 */}
                                            <div style={{
                                                marginTop: 16,
                                                padding: '20px 24px',
                                                background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                                                border: '1px solid #bbf7d0',
                                                borderRadius: 16,
                                                textAlign: 'center',
                                            }}>
                                                <div style={{ fontSize: 28, marginBottom: 8 }}>🔓</div>
                                                <div style={{
                                                    fontSize: 16, fontWeight: 700, color: '#166534',
                                                    marginBottom: 6,
                                                }}>
                                                    더 많은 대화를 원하시나요?
                                                </div>
                                                <div style={{
                                                    fontSize: 13, color: '#4ade80', marginBottom: 16,
                                                    lineHeight: 1.6,
                                                }}>
                                                    Google 계정으로 3초 만에 로그인하고<br />
                                                    하루 20회 무료 대화를 즐기세요!
                                                </div>
                                                <a
                                                    href="/login"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 10,
                                                        padding: '12px 28px',
                                                        background: '#22c55e',
                                                        color: '#fff',
                                                        borderRadius: 12,
                                                        fontSize: 15,
                                                        fontWeight: 700,
                                                        textDecoration: 'none',
                                                        boxShadow: '0 2px 8px rgba(34,197,94,0.25)',
                                                        transition: 'transform 0.15s, box-shadow 0.15s',
                                                    }}
                                                    onMouseEnter={e => {
                                                        e.currentTarget.style.transform = 'translateY(-1px)'
                                                        e.currentTarget.style.boxShadow = '0 4px 14px rgba(34,197,94,0.35)'
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.currentTarget.style.transform = 'translateY(0)'
                                                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(34,197,94,0.25)'
                                                    }}
                                                >
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff"/>
                                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff"/>
                                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff"/>
                                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff"/>
                                                    </svg>
                                                    로그인하고 계속 대화하기
                                                </a>
                                            </div>
                                        </>
                                    ) : (
                                        <MarkdownContent content={msg.content} />
                                    )}
                                </div>

                                {/* 시간 표시 */}
                                {timeStr && msg.content && (
                                    <div style={{
                                        fontSize: 11,
                                        color: '#b0b8c1',
                                        marginTop: 4,
                                        textAlign: isUser ? 'right' : 'left',
                                    }}>
                                        {timeStr}
                                    </div>
                                )}

                                {/* 액션 아이콘 — hover 시 표시 */}
                                {msg.content && !isEmptyAssistant && (
                                    <MessageActions message={msg} mentorName={mentor.name} />
                                )}
                            </div>
                        </div>
                    </div>
                )
            })}

            <style>{`
                .msg-row:hover .msg-actions { opacity: 1 !important; }
                @keyframes msgFadeIn {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </>
    )
}
