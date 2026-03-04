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

// Web Speech API 타입 (브라우저 전용)
interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList
    resultIndex: number
}

export default function ChatInput({
    value,
    onChange,
    onSubmit,
    isStreaming,
}: ChatInputProps) {
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const recognitionRef = useRef<any>(null)

    // STT 상태
    const [isListening, setIsListening] = useState(false)
    const [sttSupported, setSttSupported] = useState(false)
    const [sttError, setSttError] = useState<string | null>(null)
    const interimRef = useRef('')

    // 브라우저 STT 지원 여부 체크
    useEffect(() => {
        const SpeechRecognition =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        setSttSupported(!!SpeechRecognition)
    }, [])

    // STT 시작/중지 토글
    const toggleListening = useCallback(() => {
        if (isListening) {
            // 중지
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

        // 인식 시작 전 기존 텍스트 기억
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
                // 실시간 프리뷰: 중간 인식 결과를 input에 표시
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
            if (event.error === 'not-allowed') {
                setSttError('마이크 권한이 필요해요')
            } else if (event.error === 'network') {
                setSttError('네트워크 연결을 확인해주세요')
            } else if (event.error === 'no-speech') {
                // 조용한 환경 — 에러 표시 안 함
                setSttError(null)
            } else {
                setSttError('음성 인식 오류가 발생했어요')
            }
        }

        recognition.onend = () => {
            setIsListening(false)
        }

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

    // 에러 메시지 자동 숨김
    useEffect(() => {
        if (!sttError) return
        const timer = setTimeout(() => setSttError(null), 3000)
        return () => clearTimeout(timer)
    }, [sttError])

    // 컴포넌트 언마운트 시 정리
    useEffect(() => {
        return () => {
            recognitionRef.current?.stop()
        }
    }, [])

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value
        if (newValue.length > MAX_INPUT_LENGTH) return
        onChange(newValue)

        // Auto-resize
        const textarea = e.target
        textarea.style.height = 'auto'
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
    }, [onChange])

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault()
        if (!value.trim() || isStreaming) return

        // STT 중이면 중지
        if (isListening) {
            recognitionRef.current?.stop()
            setIsListening(false)
        }

        onSubmit(value)

        if (inputRef.current) {
            inputRef.current.style.height = 'auto'
        }
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
            if (inputRef.current) {
                inputRef.current.style.height = 'auto'
            }
        }
    }, [value, isStreaming, isListening, onSubmit])

    const canSend = value.trim() && !isStreaming
    const charCount = value.length
    const isNearLimit = charCount > MAX_INPUT_LENGTH * 0.9

    return (
        <div style={{
            background: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
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
                    maxWidth: 860,
                    width: 'calc(100% - 32px)',
                    textAlign: 'center',
                    animation: 'fadeIn 0.2s ease',
                }}>
                    🎤 {sttError}
                </div>
            )}

            <form
                onSubmit={handleSubmit}
                className="chat-input-form"
                style={{
                    width: '100%',
                    maxWidth: 860,
                    padding: '12px clamp(12px, 4vw, 32px) max(env(safe-area-inset-bottom, 12px), 16px)',
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 10,
                }}
            >
                <div style={{
                    flex: 1,
                    position: 'relative',
                }}>
                    <div className="chat-input-wrapper" style={{
                        background: '#ffffff',
                        borderRadius: 28,
                        padding: '16px 24px',
                        display: 'flex',
                        alignItems: 'center',
                        border: isListening ? '2px solid #22c55e' : '2px solid #e5e7eb',
                        boxShadow: isListening
                            ? '0 0 0 3px rgba(34,197,94,0.15), 0 2px 12px rgba(0,0,0,0.06)'
                            : '0 2px 12px rgba(0,0,0,0.06)',
                        transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}>
                        <textarea
                            ref={inputRef}
                            value={value}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            placeholder={isListening ? '듣고 있어요... 🎤' : '메시지 입력하기'}
                            aria-label="멘토에게 보낼 메시지"
                            className="chat-input-textarea"
                            rows={1}
                            maxLength={MAX_INPUT_LENGTH}
                            style={{
                                flex: 1,
                                border: 'none',
                                background: 'transparent',
                                fontSize: 16,
                                color: '#18181b',
                                resize: 'none',
                                outline: 'none',
                                lineHeight: 1.6,
                                maxHeight: 150,
                                fontFamily: 'inherit',
                            }}
                            disabled={isStreaming}
                        />
                    </div>

                    {/* 글자 수 표시 — 900자 이상일 때만 */}
                    {isNearLimit && (
                        <div style={{
                            position: 'absolute',
                            right: 16,
                            bottom: -18,
                            fontSize: 12,
                            color: charCount >= MAX_INPUT_LENGTH ? '#ef4444' : '#a1a1aa',
                            fontWeight: 500,
                        }}>
                            {charCount}/{MAX_INPUT_LENGTH}
                        </div>
                    )}
                </div>

                {/* 🎤 마이크 버튼 — STT 지원 브라우저에서만 표시 */}
                {sttSupported && (
                    <button
                        type="button"
                        onClick={toggleListening}
                        disabled={isStreaming}
                        aria-label={isListening ? '음성 입력 중지' : '음성으로 입력'}
                        className="chat-input-mic"
                        style={{
                            width: 48,
                            height: 48,
                            minWidth: 48,
                            minHeight: 48,
                            borderRadius: '50%',
                            background: isListening ? '#ef4444' : '#f4f4f5',
                            border: 'none',
                            color: isListening ? '#fff' : '#71717a',
                            fontSize: 20,
                            cursor: isStreaming ? 'default' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s',
                            flexShrink: 0,
                            animation: isListening ? 'micPulse 1.5s ease-in-out infinite' : 'none',
                            boxShadow: isListening ? '0 0 0 4px rgba(239,68,68,0.2)' : 'none',
                            opacity: isStreaming ? 0.5 : 1,
                        }}
                    >
                        {isListening ? '⏹' : '🎤'}
                    </button>
                )}

                {/* 전송 버튼 */}
                <button
                    type="submit"
                    disabled={!canSend}
                    aria-label="메시지 전송"
                    className="chat-input-send"
                    style={{
                        width: 48,
                        height: 48,
                        minWidth: 48,
                        minHeight: 48,
                        borderRadius: '50%',
                        background: canSend ? '#22c55e' : '#e4e4e7',
                        border: 'none',
                        color: canSend ? '#fff' : '#a1a1aa',
                        fontSize: 22,
                        cursor: canSend ? 'pointer' : 'default',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s',
                        flexShrink: 0,
                        boxShadow: canSend ? '0 4px 12px rgba(34,197,94,0.3)' : 'none',
                    }}
                >
                    ↑
                </button>
            </form>

            {/* STT 녹음 중 인디케이터 */}
            {isListening && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 16px 8px',
                    fontSize: 13,
                    color: '#ef4444',
                    fontWeight: 500,
                    animation: 'fadeIn 0.2s ease',
                }}>
                    <span style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: '#ef4444',
                        animation: 'micPulse 1.5s ease-in-out infinite',
                    }} />
                    음성 인식 중...
                </div>
            )}

            <style>{`
                @keyframes micPulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.05); }
                }
            `}</style>
        </div>
    )
}
