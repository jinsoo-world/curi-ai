'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

/** 입력 최대 글자 수 */
const MAX_INPUT_LENGTH = 1000

interface ChatInputProps {
    value: string
    onChange: (value: string) => void
    onSubmit: (content: string) => void
    isStreaming: boolean
}

// Web Speech API 타입
interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList
    resultIndex: number
}

/* ── SVG 아이콘 ── */
const MicIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="2" width="6" height="10" rx="3" />
        <path d="M4 10a6 6 0 0012 0" />
        <line x1="10" y1="16" x2="10" y2="19" />
    </svg>
)
const StopIcon = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
        <rect x="4" y="4" width="10" height="10" rx="2" />
    </svg>
)
const SendIcon = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 14V4" />
        <path d="M4 8L9 3L14 8" />
    </svg>
)

export default function ChatInput({
    value,
    onChange,
    onSubmit,
    isStreaming,
}: ChatInputProps) {
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const recognitionRef = useRef<any>(null)

    const [isListening, setIsListening] = useState(false)
    const [sttSupported, setSttSupported] = useState(false)
    const [sttError, setSttError] = useState<string | null>(null)
    const [isFocused, setIsFocused] = useState(false)
    const interimRef = useRef('')

    useEffect(() => {
        const SpeechRecognition =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        setSttSupported(!!SpeechRecognition)
    }, [])

    const toggleListening = useCallback(() => {
        if (isListening) {
            recognitionRef.current?.stop()
            setIsListening(false)
            return
        }

        const SpeechRecognition =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (!SpeechRecognition) return

        const recognition = new SpeechRecognition()
        recognition.lang = 'ko-KR'
        recognition.continuous = true
        recognition.interimResults = true
        recognition.maxAlternatives = 1

        const baseText = value

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let interimTranscript = ''
            let finalTranscript = ''

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript
                if (event.results[i].isFinal) {
                    finalTranscript += transcript
                } else {
                    interimTranscript += transcript
                }
            }

            if (finalTranscript) {
                const newValue = (baseText ? baseText + ' ' : '') + finalTranscript
                if (newValue.length <= MAX_INPUT_LENGTH) {
                    onChange(newValue)
                    interimRef.current = ''
                }
            } else if (interimTranscript) {
                interimRef.current = interimTranscript
                const preview = (baseText ? baseText + ' ' : '') + interimTranscript
                if (preview.length <= MAX_INPUT_LENGTH) {
                    onChange(preview)
                }
            }

            setSttError(null)
        }

        recognition.onerror = (event: any) => {
            console.error('[STT] Error:', event.error)
            setIsListening(false)
            if (event.error === 'not-allowed') setSttError('마이크 권한이 필요해요')
            else if (event.error === 'network') setSttError('네트워크 연결을 확인해주세요')
            else if (event.error !== 'no-speech') setSttError('음성 인식 오류가 발생했어요')
        }

        recognition.onend = () => setIsListening(false)

        try {
            recognition.start()
            recognitionRef.current = recognition
            setIsListening(true)
            setSttError(null)
        } catch (err) {
            console.error('[STT] Start failed:', err)
            setSttError('음성 인식을 시작할 수 없어요')
        }
    }, [isListening, value, onChange])

    useEffect(() => {
        if (!sttError) return
        const timer = setTimeout(() => setSttError(null), 3000)
        return () => clearTimeout(timer)
    }, [sttError])

    useEffect(() => {
        return () => { recognitionRef.current?.stop() }
    }, [])

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value
        if (newValue.length > MAX_INPUT_LENGTH) return
        onChange(newValue)
        const textarea = e.target
        textarea.style.height = 'auto'
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
    }, [onChange])

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault()
        if (!value.trim() || isStreaming) return
        if (isListening) {
            recognitionRef.current?.stop()
            setIsListening(false)
        }
        onSubmit(value)
        if (inputRef.current) inputRef.current.style.height = 'auto'
    }, [value, isStreaming, isListening, onSubmit])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (!value.trim() || isStreaming) return
            if (isListening) {
                recognitionRef.current?.stop()
                setIsListening(false)
            }
            onSubmit(value)
            if (inputRef.current) inputRef.current.style.height = 'auto'
        }
    }, [value, isStreaming, isListening, onSubmit])

    const canSend = value.trim() && !isStreaming
    const charCount = value.length
    const isNearLimit = charCount > MAX_INPUT_LENGTH * 0.9

    return (
        <div style={{
            background: '#faf8f5',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingBottom: 'max(env(safe-area-inset-bottom, 8px), 12px)',
        }}>
            {/* STT 에러 토스트 */}
            {sttError && (
                <div style={{
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontSize: 13,
                    fontWeight: 500,
                    padding: '8px 16px',
                    borderRadius: 12,
                    margin: '0 16px 8px',
                    maxWidth: 720,
                    width: 'calc(100% - 32px)',
                    textAlign: 'center',
                    animation: 'msgFadeIn 0.2s ease',
                }}>
                    🎤 {sttError}
                </div>
            )}

            <form
                onSubmit={handleSubmit}
                style={{
                    width: '100%',
                    maxWidth: 720,
                    padding: '8px clamp(12px, 4vw, 24px)',
                }}
            >
                {/* 제미나이 스타일: 큰 pill 안에 textarea + 버튼들 */}
                <div style={{
                    background: '#ffffff',
                    borderRadius: 28,
                    border: isFocused || isListening
                        ? '1.5px solid #22c55e'
                        : '1.5px solid #e2e8f0',
                    boxShadow: isFocused
                        ? '0 0 0 3px rgba(34,197,94,0.08), 0 4px 16px rgba(0,0,0,0.06)'
                        : '0 2px 12px rgba(0,0,0,0.04)',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    padding: '12px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}>
                    {/* 텍스트 입력 */}
                    <textarea
                        ref={inputRef}
                        value={value}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        placeholder={isListening ? '듣고 있어요...' : '멘토에게 메시지 보내기'}
                        aria-label="멘토에게 보낼 메시지"
                        rows={1}
                        maxLength={MAX_INPUT_LENGTH}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            fontSize: 15,
                            color: '#1e293b',
                            resize: 'none',
                            outline: 'none',
                            lineHeight: 1.6,
                            maxHeight: 120,
                            fontFamily: 'inherit',
                            width: '100%',
                            padding: '4px 8px',
                        }}
                        disabled={isStreaming}
                    />

                    {/* 하단 툴바: 글자 수 + 마이크 + 전송 */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: 6,
                        paddingRight: 4,
                    }}>
                        {isNearLimit && (
                            <span style={{
                                fontSize: 12,
                                color: charCount >= MAX_INPUT_LENGTH ? '#ef4444' : '#94a3b8',
                                fontWeight: 500,
                                marginRight: 'auto',
                                paddingLeft: 8,
                            }}>
                                {charCount}/{MAX_INPUT_LENGTH}
                            </span>
                        )}

                        {/* STT 녹음 중 표시 */}
                        {isListening && (
                            <span style={{
                                fontSize: 12,
                                color: '#ef4444',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                marginRight: 'auto',
                                paddingLeft: 8,
                                animation: 'micPulse 1.5s ease-in-out infinite',
                            }}>
                                <span style={{
                                    width: 6, height: 6, borderRadius: '50%',
                                    background: '#ef4444',
                                }} />
                                녹음 중
                            </span>
                        )}

                        {/* 마이크 버튼 */}
                        {sttSupported && (
                            <button
                                type="button"
                                onClick={toggleListening}
                                disabled={isStreaming}
                                aria-label={isListening ? '음성 입력 중지' : '음성으로 입력'}
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    background: isListening ? '#ef4444' : 'transparent',
                                    border: 'none',
                                    color: isListening ? '#fff' : '#94a3b8',
                                    cursor: isStreaming ? 'default' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s',
                                    flexShrink: 0,
                                    opacity: isStreaming ? 0.4 : 1,
                                }}
                            >
                                {isListening ? <StopIcon /> : <MicIcon />}
                            </button>
                        )}

                        {/* 전송 버튼 */}
                        <button
                            type="submit"
                            disabled={!canSend}
                            aria-label="메시지 전송"
                            style={{
                                width: 36,
                                height: 36,
                                borderRadius: '50%',
                                background: canSend
                                    ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                                    : '#e2e8f0',
                                border: 'none',
                                color: canSend ? '#fff' : '#94a3b8',
                                cursor: canSend ? 'pointer' : 'default',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s',
                                flexShrink: 0,
                                boxShadow: canSend ? '0 2px 8px rgba(34,197,94,0.3)' : 'none',
                            }}
                        >
                            <SendIcon />
                        </button>
                    </div>
                </div>
            </form>

            <style>{`
                @keyframes micPulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </div>
    )
}
