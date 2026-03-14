'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

interface VoiceCallOverlayProps {
    isOpen: boolean
    onClose: () => void
    mentorName: string
    mentorEmoji: string
    mentorImage?: string
    voiceSampleUrl?: string | null
    onSendMessage: (text: string) => Promise<string>
}

interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList
    resultIndex: number
}

export default function VoiceCallOverlay({
    isOpen, onClose, mentorName, mentorEmoji, mentorImage, voiceSampleUrl, onSendMessage,
}: VoiceCallOverlayProps) {
    const [phase, setPhase] = useState<'connecting' | 'listening' | 'thinking' | 'speaking' | 'idle'>('idle')
    const [transcript, setTranscript] = useState('')
    const [callDuration, setCallDuration] = useState(0)
    const [error, setError] = useState<string | null>(null)

    const recognitionRef = useRef<any>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (isOpen) {
            setCallDuration(0)
            setPhase('connecting')
            timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
            setTimeout(() => startListening(), 800)
        } else {
            if (timerRef.current) clearInterval(timerRef.current)
            stopAll()
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
            // 페이지 이탈 시 오디오 완전 정지
            recognitionRef.current?.stop()
            if (audioRef.current) {
                audioRef.current.pause()
                audioRef.current.src = ''
                audioRef.current = null
            }
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        }
    }, [isOpen])

    const formatDuration = (s: number) => {
        const min = Math.floor(s / 60).toString().padStart(2, '0')
        const sec = (s % 60).toString().padStart(2, '0')
        return `${min}:${sec}`
    }

    const stopAll = useCallback(() => {
        recognitionRef.current?.stop()
        audioRef.current?.pause()
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        setPhase('idle')
    }, [])

    // 🎙️ 장시간 침묵 자동 대사
    const startIdleTimer = useCallback(() => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        idleTimerRef.current = setTimeout(async () => {
            // 15초 침묵 → 멘토가 먼저 말 걸기
            setPhase('speaking')
            try {
                const ttsRes = await fetch('/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: '아직 계세요? 궁금한 게 있으면 편하게 말씀해 주세요!',
                        mentorName,
                    }),
                })
                if (ttsRes.ok) {
                    const { audioUrl } = await ttsRes.json()
                    if (audioUrl) {
                        const audio = new Audio(audioUrl)
                        audioRef.current = audio
                        audio.onended = () => { setPhase('listening'); startListening() }
                        audio.onerror = () => { setPhase('listening'); startListening() }
                        await audio.play()
                        return
                    }
                }
            } catch { /* ignore */ }
            setPhase('listening')
            startListening()
        }, 15000)
    }, [mentorName])

    const startListening = useCallback(() => {
        const SpeechRecognition =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (!SpeechRecognition) {
            setError('이 브라우저에서 음성 인식을 지원하지 않아요')
            return
        }

        setPhase('listening')
        setTranscript('')
        setError(null)
        startIdleTimer()

        const recognition = new SpeechRecognition()
        recognition.lang = 'ko-KR'
        recognition.continuous = true
        recognition.interimResults = true
        recognition.maxAlternatives = 1

        let finalText = ''

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
            let interim = ''
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript
                if (event.results[i].isFinal) {
                    finalText += t
                } else {
                    interim = t
                }
            }
            setTranscript(finalText + interim)

            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
            if (finalText) {
                silenceTimerRef.current = setTimeout(() => {
                    recognition.stop()
                    handleSendAndSpeak(finalText)
                }, 2500)
            }
        }

        recognition.onerror = (event: any) => {
            if (event.error === 'no-speech') {
                setTimeout(() => {
                    if (phase === 'listening') startListening()
                }, 500)
            } else if (event.error === 'not-allowed') {
                setError('마이크 권한이 필요해요')
                setPhase('idle')
            }
        }

        recognition.onend = () => { /* handleSendAndSpeak에서 처리 */ }

        try {
            recognition.start()
            recognitionRef.current = recognition
        } catch {
            setError('음성 인식을 시작할 수 없어요')
            setPhase('idle')
        }
    }, [phase, startIdleTimer])

    // 첫 문장만 추출 (TTS 속도 최적화)
    const extractFirstSentences = (text: string, maxLen: number) => {
        // 마침표/물음표/느낌표로 끝나는 첫 1~2문장
        const sentences = text.match(/[^.!?。？！]+[.!?。？！]+/g)
        if (sentences) {
            let result = ''
            for (const s of sentences) {
                if ((result + s).length > maxLen) break
                result += s
            }
            return result || text.slice(0, maxLen)
        }
        return text.slice(0, maxLen)
    }

    const handleSendAndSpeak = useCallback(async (text: string) => {
        if (!text.trim()) { startListening(); return }

        setPhase('thinking')

        try {
            // 1) AI 답변 가져오기
            let response: string
            try {
                response = await onSendMessage(text)
            } catch (chatErr) {
                console.error('[VoiceCall] Chat API 실패:', chatErr)
                setError('AI 답변을 가져올 수 없어요')
                setTimeout(() => { setError(null); setPhase('listening'); startListening() }, 3000)
                return
            }

            if (!response?.trim()) {
                console.warn('[VoiceCall] AI 답변이 비었음')
                setPhase('listening')
                startListening()
                return
            }

            setPhase('speaking')

            // 2) TTS 호출
            try {
                const ttsRes = await fetch('/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: extractFirstSentences(response, 150),
                        mentorName,
                        voiceSampleUrl: voiceSampleUrl || undefined,
                    }),
                })

                if (ttsRes.ok) {
                    const { audioUrl } = await ttsRes.json()
                    if (audioUrl) {
                        const audio = new Audio(audioUrl)
                        audioRef.current = audio
                        audio.onended = () => { setPhase('listening'); startListening() }
                        audio.onerror = () => { setPhase('listening'); startListening() }
                        await audio.play()
                        return
                    }
                } else {
                    const errText = await ttsRes.text().catch(() => '')
                    console.error('[VoiceCall] TTS API 실패:', ttsRes.status, errText)
                }
            } catch (ttsErr) {
                console.error('[VoiceCall] TTS fetch 실패:', ttsErr)
            }

            // TTS 실패해도 대화는 계속
            setTimeout(() => { setPhase('listening'); startListening() }, 2000)
        } catch (err) {
            console.error('[VoiceCall] 전체 에러:', err)
            setError('대화 중 오류가 발생했어요')
            setTimeout(() => { setError(null); setPhase('listening'); startListening() }, 2000)
        }
    }, [onSendMessage, mentorName, voiceSampleUrl, startListening])

    const handleHangup = useCallback(() => {
        stopAll()
        onClose()
    }, [stopAll, onClose])

    if (!isOpen) return null

    // LennyBot 스타일 — 깔끔한 화이트 배경, 큰 원형 아바타
    const ringColor =
        phase === 'speaking' ? 'rgba(249,115,22,0.2)'
        : phase === 'listening' ? 'rgba(59,130,246,0.15)'
        : phase === 'thinking' ? 'rgba(251,191,36,0.15)'
        : 'rgba(229,231,235,0.5)'

    const statusText =
        phase === 'connecting' ? '연결 중...'
        : phase === 'listening' ? '듣고 있어요...'
        : phase === 'thinking' ? '생각 중...'
        : phase === 'speaking' ? '말하는 중'
        : ''

    const statusColor =
        phase === 'speaking' ? '#f97316'
        : phase === 'listening' ? '#3b82f6'
        : phase === 'thinking' ? '#f59e0b'
        : '#9ca3af'

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: '#fafafa',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center',
            animation: 'vcFadeIn 0.3s ease',
        }}>
            {/* 아바타 — 큰 원형 + 상태 링 */}
            <div style={{
                width: 200, height: 200, borderRadius: '50%',
                background: ringColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.5s ease',
                animation: phase === 'speaking' ? 'vcPulse 2s ease-in-out infinite' : 'none',
            }}>
                <div style={{
                    width: 170, height: 170, borderRadius: '50%',
                    background: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                    overflow: 'hidden',
                }}>
                    {mentorImage ? (
                        <img src={mentorImage} alt={mentorName}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <span style={{ fontSize: 72 }}>{mentorEmoji}</span>
                    )}
                </div>
            </div>

            {/* 멘토 이름 */}
            <div style={{
                color: '#18181b', fontSize: 28, fontWeight: 700,
                marginTop: 28, letterSpacing: '-0.02em',
            }}>
                {mentorName}
            </div>

            {/* 상태 표시 — LennyBot 스타일 배지 */}
            <div style={{
                marginTop: 12, display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 16px', borderRadius: 20,
                background: phase === 'speaking' ? 'rgba(249,115,22,0.08)' : 'rgba(0,0,0,0.03)',
                color: statusColor,
                fontSize: 14, fontWeight: 500,
                transition: 'all 0.3s ease',
            }}>
                {statusText}
                {(phase === 'speaking' || phase === 'listening') && (
                    <span style={{ display: 'flex', gap: 2 }}>
                        {[0, 1, 2].map(i => (
                            <span key={i} style={{
                                width: 4, height: phase === 'speaking' ? 12 : 4,
                                borderRadius: 2,
                                background: statusColor,
                                animation: phase === 'speaking'
                                    ? `vcBar 0.6s ease ${i * 0.15}s infinite alternate`
                                    : `vcDot 1s ease ${i * 0.3}s infinite`,
                            }} />
                        ))}
                    </span>
                )}
                {phase === 'thinking' && (
                    <span style={{ display: 'flex', gap: 3 }}>
                        {[0, 1, 2].map(i => (
                            <span key={i} style={{
                                width: 5, height: 5, borderRadius: '50%',
                                background: statusColor,
                                animation: `vcDot 1s ease ${i * 0.2}s infinite`,
                            }} />
                        ))}
                    </span>
                )}
            </div>

            {/* 통화 시간 */}
            <div style={{
                color: '#d4d4d8', fontSize: 13, marginTop: 8,
                fontFeatureSettings: '"tnum"',
            }}>
                {formatDuration(callDuration)}
            </div>

            {/* 현재 인식 중인 텍스트 */}
            {transcript && phase === 'listening' && (
                <div style={{
                    marginTop: 24, maxWidth: 300, textAlign: 'center',
                    color: '#6b7280', fontSize: 15, lineHeight: 1.6,
                    padding: '10px 20px', borderRadius: 16,
                    background: '#f4f4f5',
                }}>
                    &quot;{transcript}&quot;
                </div>
            )}

            {error && (
                <div style={{
                    marginTop: 16, color: '#ef4444', fontSize: 13,
                    padding: '8px 16px', borderRadius: 12,
                    background: '#fef2f2',
                }}>
                    {error}
                </div>
            )}

            {/* 하단 버튼 — 마이크 + 끊기 */}
            <div style={{
                position: 'absolute', bottom: 80,
                display: 'flex', gap: 24, alignItems: 'center',
            }}>
                {/* 마이크 버튼 */}
                <button
                    onClick={() => {
                        if (phase === 'listening') {
                            recognitionRef.current?.stop()
                            setPhase('idle')
                        } else if (phase === 'idle') {
                            startListening()
                        }
                    }}
                    style={{
                        width: 56, height: 56, borderRadius: '50%',
                        background: phase === 'listening' ? '#f4f4f5' : '#e5e7eb',
                        border: 'none',
                        color: '#18181b',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                    }}
                    title={phase === 'listening' ? '마이크 끄기' : '마이크 켜기'}
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="1" width="6" height="12" rx="3" />
                        <path d="M5 10a7 7 0 0014 0" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                    </svg>
                </button>

                {/* 끊기 버튼 */}
                <button
                    onClick={handleHangup}
                    style={{
                        width: 56, height: 56, borderRadius: '50%',
                        background: '#fce4ec',
                        border: 'none',
                        color: '#ef4444',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                    }}
                    title="통화 종료"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#ef4444" stroke="none">
                        <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 010-1.36C3.42 8.63 7.48 7 12 7s8.58 1.63 11.71 4.72c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.1-.7-.28a11.27 11.27 0 00-2.67-1.85.996.996 0 01-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
                    </svg>
                </button>
            </div>

            <style>{`
                @keyframes vcFadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes vcPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
                @keyframes vcBar {
                    0% { height: 4px; }
                    100% { height: 14px; }
                }
                @keyframes vcDot {
                    0%, 100% { opacity: 0.3; }
                    50% { opacity: 1; }
                }
            `}</style>
        </div>
    )
}
