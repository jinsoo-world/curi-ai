'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

/** 입력 최대 글자 수 */
const MAX_INPUT_LENGTH = 1000

interface ChatInputProps {
    value: string
    onChange: (value: string) => void
    onSubmit: (content: string, inputMethod?: 'text' | 'stt', imageUrl?: string) => void | Promise<boolean | void>
    isStreaming: boolean
    /** 로그인 여부 (사진 첨부는 회원만) */
    isLoggedIn?: boolean
    /** 비회원이 사진을 누를 때 로그인 안내를 띄운다 */
    onNeedLogin?: () => void
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
const PhotoIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
        <circle cx="7" cy="8" r="1.5" />
        <path d="M3 14l4-4 3.5 3.5L13 11l4 4" />
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
    isLoggedIn = false,
    onNeedLogin,
}: ChatInputProps) {
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const recognitionRef = useRef<any>(null)
    const fileRef = useRef<HTMLInputElement>(null)

    const [isListening, setIsListening] = useState(false)
    const [sttSupported, setSttSupported] = useState(false)
    const [sttError, setSttError] = useState<string | null>(null)
    const [isFocused, setIsFocused] = useState(false)
    /** 올리기가 끝나 대화에 붙일 준비가 된 사진 주소 */
    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [imageUploading, setImageUploading] = useState(false)
    const [imageError, setImageError] = useState<string | null>(null)
    const interimRef = useRef('')
    /** STT로 입력이 들어왔는지 추적 */
    const usedSttRef = useRef(false)

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
                    usedSttRef.current = true
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
        if (!imageError) return
        const timer = setTimeout(() => setImageError(null), 4000)
        return () => clearTimeout(timer)
    }, [imageError])

    useEffect(() => {
        return () => { recognitionRef.current?.stop() }
    }, [])

    /** 사진 버튼 — 회원이 아니면 로그인 안내로 넘긴다 */
    const handlePhotoClick = useCallback(() => {
        if (!isLoggedIn) {
            onNeedLogin?.()
            return
        }
        fileRef.current?.click()
    }, [isLoggedIn, onNeedLogin])

    /** 고른 사진을 바로 올리고 주소를 받아둔다 (보내기는 따로) */
    const handleFilePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = '' // 같은 사진을 다시 골라도 반응하게
        if (!file) return

        // 올리기 전에 크기를 먼저 본다. 큰 파일은 서버에 닿기도 전에 끊겨서
        // 고객이 원인을 알 수 없는 오류만 보게 된다.
        if (file.size > 4 * 1024 * 1024) {
            setImageError('사진은 4MB 이하만 보낼 수 있어요.')
            return
        }

        setImageError(null)
        setImageUploading(true)
        try {
            const form = new FormData()
            form.append('file', file)
            const res = await fetch('/api/chat/upload-image', { method: 'POST', body: form })
            // 상태를 먼저 본다. 서버가 JSON 이 아닌 오류(413 등)를 줄 때
            // 먼저 파싱하면 엉뚱한 파싱 오류가 나서 진짜 원인이 안 보인다.
            if (!res.ok) {
                const msg = await res.json().catch(() => null)
                throw new Error(msg?.error || '사진을 올리지 못했어요. 다시 시도해 주세요.')
            }
            const data = await res.json()
            setImageUrl(data.url)
        } catch (err) {
            setImageError(err instanceof Error ? err.message : '사진을 올리지 못했어요.')
        } finally {
            setImageUploading(false)
        }
    }, [])

    const clearImage = useCallback(() => {
        setImageUrl(null)
        setImageError(null)
    }, [])

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value
        if (newValue.length > MAX_INPUT_LENGTH) return
        onChange(newValue)
        const textarea = e.target
        textarea.style.height = 'auto'
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
    }, [onChange])

    /** 실제로 보내고, 보냈을 때만 고른 사진을 비운다.
     *  연타 방지·횟수 제한에 걸려 안 나갔는데 비우면 사진이 말없이 사라진다. */
    const doSend = useCallback(async () => {
        // 사진만 보내는 것도 허용한다
        if ((!value.trim() && !imageUrl) || isStreaming || imageUploading) return
        const method = usedSttRef.current ? 'stt' as const : 'text' as const
        if (isListening) {
            recognitionRef.current?.stop()
            setIsListening(false)
        }
        const sent = await onSubmit(value, method, imageUrl || undefined)
        if (sent === false) return
        usedSttRef.current = false
        setImageUrl(null)
        if (inputRef.current) inputRef.current.style.height = 'auto'
    }, [value, isStreaming, isListening, onSubmit, imageUrl, imageUploading])

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault()
        doSend()
    }, [doSend])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            doSend()
        }
    }, [doSend])

    const canSend = (value.trim() || imageUrl) && !isStreaming && !imageUploading
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

            {/* 사진 오류 토스트 */}
            {imageError && (
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
                    🖼 {imageError}
                </div>
            )}

            <form
                onSubmit={handleSubmit}
                style={{
                    width: '100%',
                    // 대화 칸과 같은 폭으로 — 대표 지적 2026-09-15 「대화 UI가 너무 작아」
                    maxWidth: 900,
                    padding: '8px clamp(12px, 4vw, 40px)',
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
                    padding: 'clamp(12px, 1.1vw, 18px) clamp(16px, 1.4vw, 22px)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                }}>
                    {/* 고른 사진 미리보기 */}
                    {(imageUrl || imageUploading) && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '6px 8px 2px',
                        }}>
                            <div style={{
                                position: 'relative',
                                width: 64, height: 64,
                                borderRadius: 12,
                                overflow: 'hidden',
                                background: '#f1f5f9',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                            }}>
                                {imageUploading ? (
                                    <span style={{ fontSize: 11, color: '#64748b' }}>올리는 중</span>
                                ) : (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={imageUrl!} alt="보낼 사진" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                )}
                            </div>
                            {!imageUploading && (
                                <button
                                    type="button"
                                    onClick={clearImage}
                                    aria-label="사진 빼기"
                                    style={{
                                        background: '#f1f5f9', border: 'none', borderRadius: 10,
                                        padding: '6px 12px', fontSize: 13, color: '#475569',
                                        cursor: 'pointer', fontWeight: 500,
                                    }}
                                >사진 빼기</button>
                            )}
                        </div>
                    )}

                    {/* 텍스트 입력 */}
                    <textarea
                        ref={inputRef}
                        value={value}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        placeholder={isListening ? '듣고 있어요...' : '메시지 보내기'}
                        aria-label="멘토에게 보낼 메시지"
                        rows={1}
                        maxLength={MAX_INPUT_LENGTH}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            fontSize: 'clamp(17px, 1.45vw, 19px)',
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

                        {/* 사진 첨부 버튼 */}
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                            onChange={handleFilePick}
                            style={{ display: 'none' }}
                            aria-hidden="true"
                            tabIndex={-1}
                        />
                        <button
                            type="button"
                            onClick={handlePhotoClick}
                            disabled={isStreaming || imageUploading}
                            aria-label="사진 첨부"
                            title="사진 보내기"
                            style={{
                                width: 'clamp(48px, 3.6vw, 56px)',
                                height: 'clamp(48px, 3.6vw, 56px)',
                                borderRadius: '50%',
                                background: '#EDF7F1',
                                border: 'none',
                                color: 'var(--진초록)',
                                cursor: (isStreaming || imageUploading) ? 'default' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s',
                                flexShrink: 0,
                                opacity: (isStreaming || imageUploading) ? 0.4 : 1,
                            }}
                        >
                            <PhotoIcon />
                        </button>

                        {/* 마이크 버튼 */}
                        {sttSupported && (
                            <button
                                type="button"
                                onClick={toggleListening}
                                disabled={isStreaming}
                                aria-label={isListening ? '음성 입력 중지' : '음성으로 입력'}
                                style={{
                                    width: 'clamp(48px, 3.6vw, 56px)',
                                    height: 'clamp(48px, 3.6vw, 56px)',
                                    borderRadius: '50%',
                                    background: isListening ? '#ef4444' : '#EDF7F1',
                                    border: 'none',
                                    color: isListening ? '#fff' : 'var(--진초록)',
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
                                width: 52,
                                height: 52,
                                borderRadius: '50%',
                                background: canSend ? 'var(--연두)' : '#CFD8D2',
                                border: 'none',
                                color: '#fff',
                                cursor: canSend ? 'pointer' : 'default',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s',
                                flexShrink: 0,
                                boxShadow: canSend ? '0 4px 14px rgba(34,197,94,0.35)' : 'none',
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
