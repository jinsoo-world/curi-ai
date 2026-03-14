'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

interface VoiceCallOverlayProps {
    isOpen: boolean
    onClose: () => void
    mentorName: string
    mentorEmoji: string
    mentorImage?: string
    voiceSampleUrl?: string | null
    userName?: string
    onSendMessage: (text: string) => Promise<string>
}

interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList
    resultIndex: number
}

export default function VoiceCallOverlay({
    isOpen, onClose, mentorName, mentorEmoji, mentorImage, voiceSampleUrl, userName, onSendMessage,
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
    // 🛑 AbortController — 끼어들기 시 LLM+TTS 요청 완전 취소
    const abortRef = useRef<AbortController | null>(null)

    // ────────────────────────────────────────────────────────────
    // 📞 1. Pre-greeting: 로컬 greeting.mp3 즉시 재생 (API 없음, 0.1초)
    // ────────────────────────────────────────────────────────────
    const playGreeting = useCallback(async () => {
        setPhase('speaking')
        try {
            const audio = new Audio('/audio/greeting.mp3')
            audioRef.current = audio
            audio.onended = () => { setPhase('listening'); startListening() }
            audio.onerror = () => {
                // greeting.mp3 없으면 바로 듣기 모드
                console.warn('[VoiceCall] greeting.mp3 로드 실패 → 바로 듣기 시작')
                setPhase('listening')
                startListening()
            }
            await audio.play()
        } catch {
            setPhase('listening')
            startListening()
        }
    }, [])

    // ────────────────────────────────────────────────────────────
    // 🔄 Lifecycle: 연결/해제
    // ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (isOpen) {
            setCallDuration(0)
            setPhase('connecting')
            timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
            setTimeout(() => playGreeting(), 300)
        } else {
            if (timerRef.current) clearInterval(timerRef.current)
            stopAll()
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
            abortRef.current?.abort()
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

    // ────────────────────────────────────────────────────────────
    // 🛑 stopAll + AbortController
    // ────────────────────────────────────────────────────────────
    const stopAll = useCallback(() => {
        abortRef.current?.abort()
        abortRef.current = null
        recognitionRef.current?.stop()
        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.src = ''
            audioRef.current = null
        }
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        setPhase('idle')
    }, [])

    // ────────────────────────────────────────────────────────────
    // 🎙️ 장시간 침묵 → 멘토가 먼저 말 걸기 (학습된 목소리)
    // ────────────────────────────────────────────────────────────
    const startIdleTimer = useCallback(() => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        idleTimerRef.current = setTimeout(async () => {
            setPhase('speaking')
            try {
                const ttsRes = await fetch('/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: '아직 계세요? 궁금한 게 있으면 편하게 말씀해 주세요!',
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
                }
            } catch { /* ignore */ }
            setPhase('listening')
            startListening()
        }, 15000)
    }, [mentorName, voiceSampleUrl])

    // ────────────────────────────────────────────────────────────
    // 🛑 끼어들기: AbortController로 LLM+TTS 완전 취소
    // ────────────────────────────────────────────────────────────
    const interruptSpeaking = useCallback(() => {
        console.log('[VoiceCall] 🛑 끼어들기! LLM+TTS 완전 취소')
        // 진행 중인 LLM/TTS fetch 취소
        abortRef.current?.abort()
        abortRef.current = null
        // 재생 중인 오디오 중지
        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.src = ''
            audioRef.current = null
        }
        setPhase('listening')
    }, [])

    // ────────────────────────────────────────────────────────────
    // 👂 음성 인식 (listening 모드)
    // ────────────────────────────────────────────────────────────
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

            // ⚡ 500ms 침묵 감지 → 즉시 전송 (사람 대화 리듬)
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
            if (finalText) {
                silenceTimerRef.current = setTimeout(() => {
                    recognition.stop()
                    handleSendAndSpeak(finalText)
                }, 500)
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

    // ────────────────────────────────────────────────────────────
    // 🛑 speaking 중 끼어들기 감지 (보조 음성 인식)
    // ────────────────────────────────────────────────────────────
    const startInterruptionDetection = useCallback(() => {
        const SpeechRecognition =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (!SpeechRecognition) return

        const recognition = new SpeechRecognition()
        recognition.lang = 'ko-KR'
        recognition.continuous = true
        recognition.interimResults = true

        recognition.onresult = () => {
            interruptSpeaking()
            recognition.stop()
            setTimeout(() => startListening(), 100)
        }

        recognition.onerror = () => { /* 무시 */ }
        recognition.onend = () => { /* 자동 종료 허용 */ }

        try {
            recognition.start()
            recognitionRef.current = recognition
        } catch { /* 무시 */ }
    }, [interruptSpeaking, startListening])

    // ────────────────────────────────────────────────────────────
    // 첫 문장 추출 (TTS 텍스트 80자 제한)
    // ────────────────────────────────────────────────────────────
    const extractFirstSentences = (text: string, maxLen: number) => {
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

    // ────────────────────────────────────────────────────────────
    // 🗣️ AI 답변 → TTS 재생 (AbortController 적용)
    // ────────────────────────────────────────────────────────────
    const handleSendAndSpeak = useCallback(async (text: string) => {
        if (!text.trim()) { startListening(); return }

        // 이전 요청 취소
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        setPhase('thinking')

        try {
            // 1) AI 답변 가져오기
            let response: string
            try {
                response = await onSendMessage(text)
                if (controller.signal.aborted) return
            } catch (chatErr) {
                if (controller.signal.aborted) return
                console.error('[VoiceCall] Chat API 실패:', chatErr)
                setError('AI 답변을 가져올 수 없어요')
                setTimeout(() => { setError(null); setPhase('listening'); startListening() }, 3000)
                return
            }

            if (!response?.trim() || controller.signal.aborted) {
                if (!controller.signal.aborted) { setPhase('listening'); startListening() }
                return
            }

            setPhase('speaking')
            startInterruptionDetection()

            // 2) MiniMax Voice Clone TTS — 첫 문장 80자
            const ttsText = extractFirstSentences(response, 80)

            try {
                const ttsRes = await fetch('/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: ttsText,
                        mentorName,
                        voiceSampleUrl: voiceSampleUrl || undefined,
                    }),
                    signal: controller.signal,
                })

                if (controller.signal.aborted) return

                if (ttsRes.ok) {
                    const { audioUrl } = await ttsRes.json()
                    if (audioUrl && !controller.signal.aborted) {
                        const audio = new Audio(audioUrl)
                        audioRef.current = audio
                        audio.onended = () => { setPhase('listening'); startListening() }
                        audio.onerror = () => { setPhase('listening'); startListening() }
                        await audio.play()
                        return
                    }
                } else {
                    console.error('[VoiceCall] TTS 실패:', ttsRes.status)
                }
            } catch (ttsErr: any) {
                if (ttsErr?.name === 'AbortError') return
                console.error('[VoiceCall] TTS 에러:', ttsErr)
            }

            if (!controller.signal.aborted) {
                setTimeout(() => { setPhase('listening'); startListening() }, 1500)
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') return
            console.error('[VoiceCall] 전체 에러:', err)
            setError('대화 중 오류가 발생했어요')
            setTimeout(() => { setError(null); setPhase('listening'); startListening() }, 2000)
        }
    }, [onSendMessage, mentorName, voiceSampleUrl, startListening, startInterruptionDetection])

    const handleHangup = useCallback(() => {
        stopAll()
        onClose()
    }, [stopAll, onClose])

    if (!isOpen) return null

    // ────────────────────────────────────────────────────────────
    // 🎨 UI — LennyBot 스타일
    // ────────────────────────────────────────────────────────────
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

    const statusDots =
        phase === 'listening' ? (
            <span style={{ display: 'inline-flex', gap: 3, marginLeft: 6 }}>
                {[0, 1, 2].map(i => (
                    <span key={i} style={{
                        width: 6, height: 6, borderRadius: '50%', backgroundColor: '#3b82f6',
                        animation: `voicePulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }} />
                ))}
            </span>
        ) : phase === 'speaking' ? (
            <span style={{ display: 'inline-flex', gap: 2, marginLeft: 6, alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                    <span key={i} style={{
                        width: 4, height: 14 + i * 4, borderRadius: 2, backgroundColor: '#f97316',
                        animation: `voiceWave 0.8s ease-in-out ${i * 0.15}s infinite alternate`,
                    }} />
                ))}
            </span>
        ) : phase === 'thinking' ? (
            <span style={{ display: 'inline-flex', gap: 3, marginLeft: 6 }}>
                {[0, 1, 2].map(i => (
                    <span key={i} style={{
                        width: 6, height: 6, borderRadius: '50%', backgroundColor: '#fbbf24',
                        animation: `voicePulse 1s ease-in-out ${i * 0.3}s infinite`,
                    }} />
                ))}
            </span>
        ) : null

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: '#F9FAFB',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
            <style>{`
                @keyframes voicePulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.2)} }
                @keyframes voiceWave { 0%{transform:scaleY(.5)} 100%{transform:scaleY(1.3)} }
                @keyframes ringPulse { 0%{box-shadow:0 0 0 0 rgba(249,115,22,.3)} 100%{box-shadow:0 0 0 20px rgba(249,115,22,0)} }
            `}</style>

            {/* 아바타 */}
            <div style={{
                width: 180, height: 180, borderRadius: '50%',
                border: `6px solid ${ringColor}`,
                overflow: 'hidden',
                animation: phase === 'speaking' ? 'ringPulse 1.5s ease-in-out infinite' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: '#fff',
            }}>
                {mentorImage ? (
                    <img src={mentorImage} alt={mentorName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <span style={{ fontSize: 64 }}>{mentorEmoji}</span>
                )}
            </div>

            {/* 이름 */}
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#111', margin: '20px 0 8px' }}>
                {mentorName}
            </h2>

            {/* 상태 */}
            <div style={{
                display: 'flex', alignItems: 'center',
                padding: '6px 16px', borderRadius: 20,
                background: phase === 'speaking' ? 'rgba(249,115,22,0.08)' : 'rgba(0,0,0,0.04)',
                color: phase === 'speaking' ? '#f97316' : '#666', fontSize: 14, fontWeight: 500,
            }}>
                {statusText} {statusDots}
            </div>

            {/* 타이머 */}
            <p style={{ color: '#aaa', fontSize: 14, marginTop: 8 }}>{formatDuration(callDuration)}</p>

            {/* 인식 텍스트 */}
            {transcript && (
                <div style={{
                    margin: '20px 24px 0', padding: '12px 16px', borderRadius: 12,
                    background: '#fff', border: '1px solid #e5e7eb',
                    maxWidth: 300, fontSize: 14, color: '#374151', textAlign: 'center',
                    maxHeight: 80, overflow: 'hidden',
                }}>
                    {transcript}
                </div>
            )}

            {/* 에러 */}
            {error && (
                <div style={{
                    margin: '12px 24px 0', padding: '8px 16px', borderRadius: 8,
                    background: '#FEF2F2', color: '#DC2626', fontSize: 13, textAlign: 'center',
                }}>
                    {error}
                </div>
            )}

            {/* 종료 버튼 */}
            <button
                onClick={handleHangup}
                style={{
                    position: 'absolute', bottom: 60,
                    width: 64, height: 64, borderRadius: '50%',
                    background: '#EF4444', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(239,68,68,0.3)',
                }}
            >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                    <line x1="23" y1="1" x2="1" y2="23" />
                </svg>
            </button>
        </div>
    )
}
