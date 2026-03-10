'use client'

import { useState, useCallback } from 'react'
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

/** 복사/좋아요/아쉬워요 액션 아이콘 — 제미나이 스타일 작은 아이콘 */
function MessageActions({ message }: { message: ChatMessage }) {
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
                                    <MessageActions message={msg} />
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
