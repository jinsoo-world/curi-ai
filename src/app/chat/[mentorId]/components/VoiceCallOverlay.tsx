'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

interface VoiceCallOverlayProps {
    isOpen: boolean
    onClose: () => void
    mentorName: string
    mentorEmoji: string
    mentorImage?: string
    voiceSampleUrl?: string | null
    voiceId?: string | null // ⚡ DB에서 받은 pre-cloned voice_id
    userName?: string
    onSendMessage: (text: string) => Promise<string>
}

interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList
    resultIndex: number
}

export default function VoiceCallOverlay({
    isOpen, onClose, mentorName, mentorEmoji, mentorImage, voiceSampleUrl, voiceId, userName, onSendMessage,
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
    const abortRef = useRef<AbortController | null>(null)
    const prefetchedGreetingRef = useRef<string | null>(null)

    // 🔊 오디오 큐 — 문장별 TTS를 순차 재생 (겹침 방지)
    const audioQueueRef = useRef<string[]>([])
    const isPlayingRef = useRef(false)

    // ⚡ 안전한 voiceId — null이면 폴백 없이 TTS route에서 처리
    const safeVoiceId = voiceId || undefined

    // ────────────────────────────────────────────────────────────
    // 🔊 오디오 큐 순차 재생 시스템
    // ────────────────────────────────────────────────────────────
    const playNextInQueue = useCallback(() => {
        if (isPlayingRef.current) return
        const nextUrl = audioQueueRef.current.shift()
        if (!nextUrl) {
            // 큐 비었으면 듣기 모드로 전환
            setPhase('listening')
            startListening()
            return
        }

        isPlayingRef.current = true
        const audio = new Audio(nextUrl)
        audioRef.current = audio

        audio.onended = () => {
            isPlayingRef.current = false
            audioRef.current = null
            playNextInQueue() // 다음 문장 재생
        }
        audio.onerror = () => {
            isPlayingRef.current = false
            audioRef.current = null
            playNextInQueue()
        }

        audio.play().catch(() => {
            isPlayingRef.current = false
            playNextInQueue()
        })
    }, [])

    const enqueueAudio = useCallback((audioUrl: string) => {
        audioQueueRef.current.push(audioUrl)
        if (!isPlayingRef.current) {
            playNextInQueue()
        }
    }, [playNextInQueue])

    const clearAudioQueue = useCallback(() => {
        audioQueueRef.current = []
        isPlayingRef.current = false
        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.src = ''
            audioRef.current = null
        }
    }, [])

    // ────────────────────────────────────────────────────────────
    // 📞 프리패칭: 인사말 미리 생성
    // ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return
        prefetchedGreetingRef.current = null

        const displayName = userName || '고객'
        const greetingText = `네, ${displayName}님! ${mentorName}입니다, 반갑습니다!`

        fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: greetingText,
                mentorName,
                voiceId: safeVoiceId,
                voiceSampleUrl: voiceSampleUrl || undefined,
            }),
        })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data?.audioUrl) {
                prefetchedGreetingRef.current = data.audioUrl
                const preload = new Audio(data.audioUrl)
                preload.preload = 'auto'
                console.log('[VoiceCall] 🎙️ 인사말 프리패칭 완료')
            }
        })
        .catch(() => {})
    }, [isOpen, userName, mentorName, safeVoiceId, voiceSampleUrl])

    // ────────────────────────────────────────────────────────────
    // 📞 Pre-greeting: 프리패칭 or 즉시 듣기
    // ────────────────────────────────────────────────────────────
    const playGreeting = useCallback(async () => {
        setPhase('speaking')

        if (prefetchedGreetingRef.current) {
            const audio = new Audio(prefetchedGreetingRef.current)
            audioRef.current = audio
            isPlayingRef.current = true
            audio.onended = () => {
                isPlayingRef.current = false
                audioRef.current = null
                setPhase('listening')
                startListening()
            }
            audio.onerror = () => {
                isPlayingRef.current = false
                audioRef.current = null
                setPhase('listening')
                startListening()
            }
            try { await audio.play() } catch {
                isPlayingRef.current = false
                setPhase('listening')
                startListening()
            }
        } else {
            console.log('[VoiceCall] 프리패칭 미완료 → 바로 듣기 진입')
            setPhase('listening')
            startListening()
        }
    }, [])

    // ────────────────────────────────────────────────────────────
    // 🔄 Lifecycle
    // ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (isOpen) {
            setCallDuration(0)
            setPhase('connecting')
            timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
            setTimeout(() => playGreeting(), 500)
        } else {
            if (timerRef.current) clearInterval(timerRef.current)
            stopAll()
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
            abortRef.current?.abort()
            recognitionRef.current?.stop()
            clearAudioQueue()
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
        clearAudioQueue()
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        setPhase('idle')
    }, [clearAudioQueue])

    // ────────────────────────────────────────────────────────────
    // 🎙️ 장시간 침묵 → 멘토 먼저 말 걸기
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
                        voiceId: safeVoiceId,
                    }),
                })
                if (ttsRes.ok) {
                    const { audioUrl } = await ttsRes.json()
                    if (audioUrl) {
                        enqueueAudio(audioUrl)
                        return
                    }
                }
            } catch { /* ignore */ }
            setPhase('listening')
            startListening()
        }, 15000)
    }, [mentorName, safeVoiceId, enqueueAudio])

    // ────────────────────────────────────────────────────────────
    // 🛑 끼어들기 (오디오 큐 + abort 완전 취소)
    // ────────────────────────────────────────────────────────────
    const interruptSpeaking = useCallback(() => {
        console.log('[VoiceCall] 🛑 끼어들기! LLM+TTS+큐 완전 취소')
        abortRef.current?.abort()
        abortRef.current = null
        clearAudioQueue()
        setPhase('listening')
    }, [clearAudioQueue])

    // ────────────────────────────────────────────────────────────
    // 👂 음성 인식 — 500ms 침묵 감지
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

            // ⚡ 500ms 침묵 감지 → 즉시 전송
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
    // 🛑 speaking 중 끼어들기 감지 — VAD 민감도 하향 ⭐
    // 0.3초 이상 명확한 발화 지속 시에만 인터럽트 발동
    // ────────────────────────────────────────────────────────────
    const startInterruptionDetection = useCallback(() => {
        const SpeechRecognition =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (!SpeechRecognition) return

        const recognition = new SpeechRecognition()
        recognition.lang = 'ko-KR'
        recognition.continuous = true
        recognition.interimResults = true

        let speechStartTime: number | null = null

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            // 발화 감지 시작 시간 기록
            if (!speechStartTime) {
                speechStartTime = Date.now()
            }

            // 0.3초(300ms) 이상 지속된 발화만 끼어들기로 인정
            const elapsed = Date.now() - speechStartTime
            if (elapsed >= 300) {
                // isFinal 결과가 있거나, 충분히 긴 interim이면 진짜 발화
                let hasFinal = false
                let interimLen = 0
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) hasFinal = true
                    else interimLen += event.results[i][0].transcript.length
                }

                if (hasFinal || interimLen >= 2) {
                    console.log(`[VoiceCall] 끼어들기 감지 (${elapsed}ms, len=${interimLen})`)
                    interruptSpeaking()
                    recognition.stop()
                    setTimeout(() => startListening(), 100)
                    return
                }
            }
        }

        // 침묵 시 타이머 리셋
        recognition.onspeechend = () => { speechStartTime = null }
        recognition.onerror = () => { /* 무시 */ }
        recognition.onend = () => { /* 자동 종료 허용 */ }

        try {
            recognition.start()
            recognitionRef.current = recognition
        } catch { /* 무시 */ }
    }, [interruptSpeaking, startListening])

    // ────────────────────────────────────────────────────────────
    // 📝 문장 분할 — LLM 응답을 문장 단위로 쪼개기
    // ────────────────────────────────────────────────────────────
    const splitIntoSentences = (text: string): string[] => {
        // 한국어/영어 문장 구분: .!? + 한국어 마침표류
        const raw = text.match(/[^.!?。？！]+[.!?。？！]+/g)
        if (!raw || raw.length === 0) return [text.slice(0, 80)]

        // 70자 이하로 유지
        const sentences: string[] = []
        let current = ''
        for (const s of raw) {
            if ((current + s).length > 70 && current) {
                sentences.push(current.trim())
                current = s
            } else {
                current += s
            }
        }
        if (current.trim()) sentences.push(current.trim())

        return sentences.length > 0 ? sentences : [text.slice(0, 80)]
    }

    // ────────────────────────────────────────────────────────────
    // 🗣️ AI 답변 → 문장 청킹 TTS + 오디오 큐 순차 재생
    // ────────────────────────────────────────────────────────────
    const handleSendAndSpeak = useCallback(async (text: string) => {
        if (!text.trim()) { startListening(); return }

        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        setPhase('thinking')

        try {
            // 1) AI 답변
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

            // 2) 문장 단위 청킹 → 각 문장을 병렬 TTS 요청 → 오디오 큐에 순차 적재
            const sentences = splitIntoSentences(response)
            console.log(`[VoiceCall] 📝 ${sentences.length}개 문장 청킹:`, sentences)

            // 모든 TTS 요청을 병렬로 보내되, 결과는 순서대로 큐에 넣기
            const ttsPromises = sentences.map(async (sentence, idx) => {
                try {
                    const ttsRes = await fetch('/api/tts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            text: sentence,
                            mentorName,
                            voiceId: safeVoiceId,
                        }),
                        signal: controller.signal,
                    })

                    if (controller.signal.aborted) return null
                    if (ttsRes.ok) {
                        const { audioUrl } = await ttsRes.json()
                        return { idx, audioUrl }
                    }
                } catch (e: any) {
                    if (e?.name === 'AbortError') return null
                    console.error(`[VoiceCall] TTS 문장 ${idx} 실패:`, e)
                }
                return null
            })

            // 순서 보장: 첫 문장부터 순차적으로 큐에 추가
            const results = await Promise.all(ttsPromises)
            if (controller.signal.aborted) return

            for (const result of results) {
                if (result?.audioUrl && !controller.signal.aborted) {
                    enqueueAudio(result.audioUrl)
                }
            }

            // 아무것도 재생 못하면 듣기로 전환
            if (audioQueueRef.current.length === 0 && !isPlayingRef.current) {
                setPhase('listening')
                startListening()
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') return
            console.error('[VoiceCall] 전체 에러:', err)
            setError('대화 중 오류가 발생했어요')
            setTimeout(() => { setError(null); setPhase('listening'); startListening() }, 2000)
        }
    }, [onSendMessage, mentorName, safeVoiceId, startListening, startInterruptionDetection, enqueueAudio])

    const handleHangup = useCallback(() => {
        stopAll()
        onClose()
    }, [stopAll, onClose])

    if (!isOpen) return null

    // ────────────────────────────────────────────────────────────
    // 🎨 UI (변경 없음)
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

            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#111', margin: '20px 0 8px' }}>
                {mentorName}
            </h2>

            <div style={{
                display: 'flex', alignItems: 'center',
                padding: '6px 16px', borderRadius: 20,
                background: phase === 'speaking' ? 'rgba(249,115,22,0.08)' : 'rgba(0,0,0,0.04)',
                color: phase === 'speaking' ? '#f97316' : '#666', fontSize: 14, fontWeight: 500,
            }}>
                {statusText} {statusDots}
            </div>

            <p style={{ color: '#aaa', fontSize: 14, marginTop: 8 }}>{formatDuration(callDuration)}</p>

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

            {error && (
                <div style={{
                    margin: '12px 24px 0', padding: '8px 16px', borderRadius: 8,
                    background: '#FEF2F2', color: '#DC2626', fontSize: 13, textAlign: 'center',
                }}>
                    {error}
                </div>
            )}

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
