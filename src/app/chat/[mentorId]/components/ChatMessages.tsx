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

/** 복사/좋아요/아쉬워요 액션 아이콘 */
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
            // Fallback for older browsers
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

        // Save feedback to API (fire-and-forget)
        try {
            await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageId: message.id,
                    feedbackType: newFeedback,
                }),
            })
        } catch {
            // Silent fail — feedback is non-critical
        }
    }, [feedback, message.id])

    const btnStyle = (active: boolean): React.CSSProperties => ({
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        fontSize: 14,
        padding: '4px 8px',
        borderRadius: 6,
        color: active ? '#22c55e' : '#a1a1aa',
        transition: 'all 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
    })

    return (
        <div style={{
            display: 'flex',
            gap: 2,
            marginTop: 6,
            opacity: 0.7,
            transition: 'opacity 0.15s',
            justifyContent: isAssistant ? 'flex-start' : 'flex-end',
        }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '0.7' }}
        >
            <button
                onClick={handleCopy}
                style={btnStyle(copied)}
                title="복사"
                aria-label="메시지 복사"
            >
                {copied ? '✓' : '📋'}
            </button>
            {/* 👍👎는 AI 메시지에만 표시 */}
            {isAssistant && (
                <>
                    <button
                        onClick={() => handleFeedback('like')}
                        style={btnStyle(feedback === 'like')}
                        title="좋아요"
                        aria-label="좋아요 피드백"
                    >
                        👍
                    </button>
                    <button
                        onClick={() => handleFeedback('dislike')}
                        style={btnStyle(feedback === 'dislike')}
                        title="아쉬워요"
                        aria-label="아쉬워요 피드백"
                    >
                        👎
                    </button>
                </>
            )}
        </div>
    )
}

/** 마크다운 렌더링 컴포넌트 */
function MarkdownContent({ content }: { content: string }) {
    return (
        <div className="chat-markdown">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    p: ({ children }) => (
                        <p style={{ margin: '0 0 8px 0', lineHeight: 1.7 }}>{children}</p>
                    ),
                    strong: ({ children }) => (
                        <strong style={{ fontWeight: 700, color: '#18181b' }}>{children}</strong>
                    ),
                    ul: ({ children }) => (
                        <ul style={{ margin: '4px 0 8px 0', paddingLeft: 20 }}>{children}</ul>
                    ),
                    ol: ({ children }) => (
                        <ol style={{ margin: '4px 0 8px 0', paddingLeft: 20 }}>{children}</ol>
                    ),
                    li: ({ children }) => (
                        <li style={{ marginBottom: 4, lineHeight: 1.6 }}>{children}</li>
                    ),
                    code: ({ children, className }) => {
                        const isInline = !className
                        return isInline ? (
                            <code style={{
                                background: 'rgba(0,0,0,0.06)',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: '0.9em',
                            }}>{children}</code>
                        ) : (
                            <code style={{
                                display: 'block',
                                background: 'rgba(0,0,0,0.06)',
                                padding: 12,
                                borderRadius: 8,
                                fontSize: '0.85em',
                                overflowX: 'auto',
                                margin: '8px 0',
                            }}>{children}</code>
                        )
                    },
                    blockquote: ({ children }) => (
                        <blockquote style={{
                            borderLeft: '3px solid #22c55e',
                            paddingLeft: 12,
                            margin: '8px 0',
                            color: '#52525b',
                        }}>{children}</blockquote>
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    )
}

/** 타이핑 인디케이터 (점 3개 애니메이션) */
function TypingIndicator() {
    return (
        <span style={{
            display: 'inline-flex',
            gap: 4,
            alignItems: 'center',
        }}>
            <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#a1a1aa',
                animation: 'pulseSoft 1s ease-in-out infinite',
            }} />
            <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#a1a1aa',
                animation: 'pulseSoft 1s ease-in-out 0.2s infinite',
            }} />
            <span style={{
                width: 6, height: 6, borderRadius: '50%', background: '#a1a1aa',
                animation: 'pulseSoft 1s ease-in-out 0.4s infinite',
            }} />
        </span>
    )
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
            {messages.map((msg) => {
                const isUser = msg.role === 'user'
                const isEmptyAssistant = !isUser && !msg.content

                return (
                    <div
                        key={msg.id}
                        style={{
                            display: 'flex',
                            flexDirection: isUser ? 'row-reverse' : 'row',
                            alignItems: 'flex-start',
                            gap: 12,
                            animation: 'fadeIn 0.25s ease-out',
                        }}
                    >
                        {/* 멘토 아바타 */}
                        {!isUser && (
                            mentorImage ? (
                                <img
                                    src={mentorImage}
                                    alt={mentor.name}
                                    className="chat-msg-avatar"
                                    style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        flexShrink: 0,
                                        marginTop: 4,
                                    }}
                                />
                            ) : (
                                <div className="chat-msg-avatar-emoji" style={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 22,
                                    flexShrink: 0,
                                    marginTop: 4,
                                }}>
                                    {mentorEmoji}
                                </div>
                            )
                        )}

                        {/* 이름 + 메시지 + 액션 */}
                        <div className="chat-msg-body" style={{
                            display: 'flex',
                            flexDirection: 'column',
                            maxWidth: '70%',
                        }}>
                            {!isUser && (
                                <div className="chat-msg-name" style={{
                                    fontSize: 17,
                                    fontWeight: 700,
                                    color: '#3f3f46',
                                    marginBottom: 6,
                                }}>
                                    {mentor.name} AI
                                </div>
                            )}
                            <div className="chat-msg-bubble" style={{
                                padding: '16px 20px',
                                borderRadius: isUser
                                    ? '20px 20px 4px 20px'
                                    : '20px 20px 20px 4px',
                                background: isUser ? '#22c55e' : '#f0ede8',
                                color: isUser ? '#fff' : '#18181b',
                                fontSize: 17,
                                lineHeight: 1.7,
                                wordBreak: 'break-word',
                            }}>
                                {isEmptyAssistant ? (
                                    <TypingIndicator />
                                ) : isUser ? (
                                    <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                                ) : (
                                    <MarkdownContent content={msg.content} />
                                )}
                            </div>

                            {/* 📋👍👎 피드백 아이콘 — 내용이 있는 메시지에만 */}
                            {msg.content && !isEmptyAssistant && (
                                <MessageActions message={msg} />
                            )}
                        </div>
                    </div>
                )
            })}
        </>
    )
}
