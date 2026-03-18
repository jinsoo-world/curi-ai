'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export interface ChatMessage {
    id: string
    role: 'user' | 'assistant' | 'system'
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
    autoTTS?: boolean
    systemPrompt?: string
    voiceId?: string | null
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
// 🚫 마크다운 제거 — TTS 전 깨끗한 텍스트로 변환
function stripMarkdown(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, '') // 코드 블록 제거
        .replace(/`([^`]+)`/g, '$1')    // 인라인 코드
        .replace(/#{1,6}\s*/g, '')       // 제목
        .replace(/\*\*([^*]+)\*\*/g, '$1') // 굵게
        .replace(/\*([^*]+)\*/g, '$1')     // 기울임
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/~~([^~]+)~~/g, '$1')     // 취소선
        .replace(/>\s*/g, '')              // 인용
        .replace(/[-*+]\s+/g, '')          // 목록
        .replace(/\d+\.\s+/g, '')          // 번호 목록
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 링크
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // 이미지
        .replace(/\|[^|]*\|/g, '')         // 테이블
        .replace(/---+/g, '')              // 구분선
        .replace(/\n{3,}/g, '\n\n')        // 과도한 줄바꿈
        .trim()
}

// ✂️ 문장 단위 분할
function splitSentences(text: string): string[] {
    // 한국어: .다 / .요 / .까 등 + 영어: . ! ? 기준 분할
    const chunks = text.split(/(?<=[.!?다요까죠세])\s+/g).filter(s => s.trim().length > 5)
    if (chunks.length === 0) return [text]
    // 너무 짧은 조각은 합치기
    const merged: string[] = []
    let current = ''
    for (const chunk of chunks) {
        current += (current ? ' ' : '') + chunk
        if (current.length >= 40) {
            merged.push(current)
            current = ''
        }
    }
    if (current) merged.push(current)
    return merged
}

// 🎵 전역 TTS 캐시 (세션 내 동일 텍스트 즉시 재생)
const globalTTSCache = new Map<string, string>()

function TTSButton({ message, mentorName, autoPlay, systemPrompt, voiceId }: { message: ChatMessage; mentorName: string; autoPlay?: boolean; systemPrompt?: string; voiceId?: string | null }) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'playing'>('idle')
    const [progress, setProgress] = useState(0)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const hasAutoPlayed = useRef(false)
    const abortRef = useRef(false)

    // 단일 문장 TTS 호출 (캐시 사용)
    const fetchTTS = useCallback(async (text: string): Promise<string | null> => {
        const cacheKey = `${mentorName}:${text.slice(0, 100)}`
        const cached = globalTTSCache.get(cacheKey)
        if (cached) return cached

        const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, mentorName, systemPrompt, voiceId: voiceId || undefined }),
        })
        if (!res.ok) return null
        const data = await res.json()
        if (data.audioUrl) globalTTSCache.set(cacheKey, data.audioUrl)
        return data.audioUrl || null
    }, [mentorName, voiceId])

    const handleTTS = useCallback(async () => {
        if (status === 'playing' && audioRef.current) {
            audioRef.current.pause()
            audioRef.current.currentTime = 0
            abortRef.current = true
            setStatus('idle')
            setProgress(0)
            return
        }
        if (status === 'loading') return

        setStatus('loading')
        setProgress(0)
        abortRef.current = false

        try {
            const cleanText = stripMarkdown(message.content)
            const sentences = splitSentences(cleanText)

            // 문장별 순차 재생
            for (let i = 0; i < sentences.length; i++) {
                if (abortRef.current) break

                const text = sentences[i].slice(0, 500)
                const audioUrl = await fetchTTS(text)
                if (!audioUrl || abortRef.current) continue

                await new Promise<void>((resolve, reject) => {
                    const audio = new Audio(audioUrl)
                    audioRef.current = audio
                    setStatus('playing')

                    audio.ontimeupdate = () => {
                        if (audio.duration) {
                            const sentenceProgress = audio.currentTime / audio.duration
                            const totalProgress = (i + sentenceProgress) / sentences.length
                            setProgress(totalProgress * 100)
                        }
                    }
                    audio.onended = () => resolve()
                    audio.onerror = () => reject(new Error('재생 실패'))
                    audio.play().catch(reject)
                })
            }
        } catch (err) {
            console.error('[TTS Error]', err)
        } finally {
            setStatus('idle')
            setProgress(0)
            abortRef.current = false
        }
    }, [status, message.content, fetchTTS])

    // 자동 재생 트리거
    useEffect(() => {
        if (autoPlay && !hasAutoPlayed.current && status === 'idle') {
            hasAutoPlayed.current = true
            handleTTS()
        }
    }, [autoPlay])

    return (
        <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
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
            {/* 🔔 재생 중 프로그레스 바 */}
            {(status === 'playing' || status === 'loading') && (
                <div style={{
                    width: 28, height: 3, borderRadius: 2,
                    background: '#e2e8f0', overflow: 'hidden',
                }}>
                    <div style={{
                        width: `${status === 'loading' ? 30 : progress}%`,
                        height: '100%',
                        background: status === 'loading' ? '#cbd5e1' : '#22c55e',
                        borderRadius: 2,
                        transition: 'width 0.3s ease',
                        animation: status === 'loading' ? 'ttsLoadPulse 1.5s ease infinite' : 'none',
                    }} />
                </div>
            )}
        </div>
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
function MessageActions({ message, mentorName, autoPlay, systemPrompt, voiceId }: { message: ChatMessage; mentorName?: string; autoPlay?: boolean; systemPrompt?: string; voiceId?: string | null }) {
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
                    <TTSButton message={message} mentorName={mentorName || ''} autoPlay={autoPlay} systemPrompt={systemPrompt} voiceId={voiceId} />
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
                    a: ({ href, children }) => (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                color: '#3b82f6',
                                textDecoration: 'underline',
                                textUnderlineOffset: '3px',
                                fontWeight: 500,
                                wordBreak: 'break-all',
                            }}
                        >
                            {children} <span style={{ fontSize: '0.8em', opacity: 0.6 }}>↗</span>
                        </a>
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
    autoTTS,
    systemPrompt,
    voiceId,
}: ChatMessagesProps) {
    // 스트리밍 종료 감지 — autoTTS가 켜져 있을 때만
    const prevStreamingRef = useRef(isStreaming)
    const [autoPlayMsgId, setAutoPlayMsgId] = useState<string | null>(null)

    useEffect(() => {
        if (prevStreamingRef.current && !isStreaming && autoTTS) {
            // 스트리밍이 끈났을 때 마지막 assistant 메시지 자동 재생
            const lastMsg = messages[messages.length - 1]
            if (lastMsg?.role === 'assistant' && lastMsg.content) {
                setAutoPlayMsgId(lastMsg.id)
            }
        }
        prevStreamingRef.current = isStreaming
    }, [isStreaming, autoTTS, messages])

    return (
        <>
            {messages.map((msg, idx) => {
                // 시스템 메시지: 리포트 프롬프트 카드
                if (msg.role === 'system' && msg.content === '__REPORT_PROMPT__') {
                    return (
                        <div key={msg.id} style={{
                            display: 'flex', justifyContent: 'center',
                            margin: '12px 0',
                            animation: 'msgFadeIn 0.5s ease-out',
                        }}>
                            <div style={{
                                background: 'linear-gradient(135deg, #eff6ff, #f0f9ff)',
                                border: '1px solid #bfdbfe',
                                borderRadius: 16,
                                padding: '14px 20px',
                                maxWidth: 360,
                                textAlign: 'center',
                            }}>
                                <div style={{ fontSize: 20, marginBottom: 6 }}>📋</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e40af', marginBottom: 4 }}>
                                    대화가 꽤 쌓였네요!
                                </div>
                                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>
                                    지금까지 나눈 핵심 내용을 정리한<br />
                                    <strong style={{ color: '#3b82f6' }}>AI 요약 리포트</strong>를 받아보세요
                                </div>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                                    상단의 <strong>리포트</strong> 버튼을 눌러보세요 ↗
                                </div>
                            </div>
                        </div>
                    )
                }

                const isUser = msg.role === 'user'
                const isVoiceCall = msg.id.startsWith('voice-')
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
                                        <span style={{ whiteSpace: 'pre-wrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            {isVoiceCall && (
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    width: 20,
                                                    height: 20,
                                                    borderRadius: '50%',
                                                    background: 'rgba(255,255,255,0.25)',
                                                    flexShrink: 0,
                                                    fontSize: 11,
                                                }}>📞</span>
                                            )}
                                            {msg.content}
                                        </span>
                                    ) : msg.content.includes('__GUEST_LOGIN_CTA__') ? (
                                        <>
                                            <MarkdownContent content={msg.content.replace('__GUEST_LOGIN_CTA__', '')} />
                                            {/* 🔥 매력적인 회원가입 유도 카드 */}
                                            <div style={{
                                                marginTop: 16,
                                                padding: '28px 24px',
                                                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                                                border: '1px solid rgba(34,197,94,0.3)',
                                                borderRadius: 20,
                                                textAlign: 'center',
                                                position: 'relative',
                                                overflow: 'hidden',
                                            }}>
                                                {/* 배경 글로우 이펙트 */}
                                                <div style={{
                                                    position: 'absolute', top: -40, right: -40,
                                                    width: 120, height: 120, borderRadius: '50%',
                                                    background: 'radial-gradient(circle, rgba(34,197,94,0.15) 0%, transparent 70%)',
                                                }} />
                                                <div style={{
                                                    position: 'absolute', bottom: -30, left: -30,
                                                    width: 100, height: 100, borderRadius: '50%',
                                                    background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)',
                                                }} />

                                                <div style={{ fontSize: 36, marginBottom: 12 }}>🎁</div>
                                                <div style={{
                                                    fontSize: 20, fontWeight: 800, color: '#fff',
                                                    marginBottom: 8, letterSpacing: '-0.3px',
                                                }}>
                                                    가입하면 더 깊은 대화가 시작돼요
                                                </div>
                                                <div style={{
                                                    fontSize: 13, color: '#94a3b8', marginBottom: 20,
                                                    lineHeight: 1.7,
                                                }}>
                                                    카카오 / Google 계정으로 3초 가입
                                                </div>

                                                {/* 혜택 목록 */}
                                                <div style={{
                                                    display: 'flex', flexDirection: 'column', gap: 10,
                                                    marginBottom: 24, textAlign: 'left',
                                                    background: 'rgba(255,255,255,0.05)',
                                                    borderRadius: 14, padding: '16px 20px',
                                                }}>
                                                    {[
                                                        { icon: '💬', text: '매일 무제한 AI 대화', highlight: '무제한' },
                                                        { icon: '📞', text: 'AI 멘토와 음성 전화', highlight: '음성 전화' },
                                                        { icon: '📝', text: '대화 기록 영구 저장', highlight: '영구 저장' },
                                                    ].map((item, i) => (
                                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                            <span style={{ fontSize: 18 }}>{item.icon}</span>
                                                            <span style={{ fontSize: 14, color: '#e2e8f0' }}>
                                                                {item.text.split(item.highlight).map((part, j) =>
                                                                    j === 0 ? <span key={j}>{part}<strong style={{ color: '#4ade80' }}>{item.highlight}</strong></span> : <span key={j}>{part}</span>
                                                                )}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>

                                                <a
                                                    href="/login"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 10,
                                                        padding: '14px 36px',
                                                        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                                                        color: '#fff',
                                                        borderRadius: 14,
                                                        fontSize: 16,
                                                        fontWeight: 800,
                                                        textDecoration: 'none',
                                                        boxShadow: '0 4px 20px rgba(34,197,94,0.4)',
                                                        transition: 'transform 0.15s, box-shadow 0.15s',
                                                        letterSpacing: '-0.3px',
                                                    }}
                                                    onMouseEnter={e => {
                                                        e.currentTarget.style.transform = 'translateY(-2px)'
                                                        e.currentTarget.style.boxShadow = '0 6px 24px rgba(34,197,94,0.5)'
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.currentTarget.style.transform = 'translateY(0)'
                                                        e.currentTarget.style.boxShadow = '0 4px 20px rgba(34,197,94,0.4)'
                                                    }}
                                                >
                                                    🚀 무료 회원가입하기
                                                </a>
                                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 12 }}>
                                                    ✓ 30초 가입 ✓ 카드 등록 불필요 ✓ 언제든 탈퇴 가능
                                                </div>
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
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        justifyContent: isUser ? 'flex-end' : 'flex-start',
                                    }}>
                                        {isVoiceCall && (
                                            <span style={{ color: '#22c55e', fontWeight: 500 }}>📞 음성통화</span>
                                        )}
                                        {timeStr}
                                    </div>
                                )}

                                {/* 액션 아이콘 — hover 시 표시 */}
                                {msg.content && !isEmptyAssistant && (
                                    <MessageActions message={msg} mentorName={mentor.name} autoPlay={autoPlayMsgId === msg.id} systemPrompt={systemPrompt} voiceId={voiceId} />
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
