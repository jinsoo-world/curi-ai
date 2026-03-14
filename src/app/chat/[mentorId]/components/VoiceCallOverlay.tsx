'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

interface VoiceCallOverlayProps {
    isOpen: boolean
    onClose: () => void
    mentorName: string
    mentorEmoji: string
    mentorImage?: string
    voiceSampleUrl?: string | null
    voiceId?: string | null
    userName?: string
    onStreamMessage: (text: string, onSentence: (sentence: string) => void, signal: AbortSignal) => Promise<string>
}

interface SpeechRecognitionEvent {
    results: SpeechRecognitionResultList
    resultIndex: number
}

export default function VoiceCallOverlay({
    isOpen, onClose, mentorName, mentorEmoji, mentorImage, voiceSampleUrl, voiceId, userName, onStreamMessage,
}: VoiceCallOverlayProps) {
    const [phase, setPhase] = useState<'connecting' | 'listening' | 'thinking' | 'speaking' | 'idle' | 'expired'>('idle')
    const [transcript, setTranscript] = useState('')
    const [callDuration, setCallDuration] = useState(0)
    const [error, setError] = useState<string | null>(null)
    const [remainingSeconds, setRemainingSeconds] = useState<number>(180)
    const [voiceExpired, setVoiceExpired] = useState(false)

    const recognitionRef = useRef<any>(null)
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const abortRef = useRef<AbortController | null>(null)
    const maxCallSecondsRef = useRef(60) // 1분 제한

    // 🔊 Ordered Slot 큐 + Concurrency 1 Lock
    const slotMapRef = useRef<Map<number, string | null>>(new Map())
    const nextPlayIndexRef = useRef(0)
    const totalSlotsRef = useRef(0)
    const isPlayingRef = useRef(false)
    const streamDoneRef = useRef(false)
    const ttsQueueRef = useRef<{ sentence: string; slotIndex: number }[]>([])
    const isTtsProcessingRef = useRef(false)  // ⚡ Concurrency 1 Lock

    const safeVoiceId = voiceId || undefined

    // ── 🔊 Ordered Slot 큐 재생 ──
    const tryPlayNext = useCallback(() => {
        if (isPlayingRef.current) return
        const nextIdx = nextPlayIndexRef.current
        const audioUrl = slotMapRef.current.get(nextIdx)

        if (audioUrl === undefined || audioUrl === null) {
            if (streamDoneRef.current && nextIdx >= totalSlotsRef.current) {
                setPhase('listening')
                startListening()
            }
            return
        }

        isPlayingRef.current = true
        nextPlayIndexRef.current = nextIdx + 1
        slotMapRef.current.delete(nextIdx)

        const audio = new Audio(audioUrl)
        audioRef.current = audio
        audio.onended = () => { isPlayingRef.current = false; audioRef.current = null; tryPlayNext() }
        audio.onerror = () => { isPlayingRef.current = false; audioRef.current = null; tryPlayNext() }
        audio.play().catch(() => { isPlayingRef.current = false; tryPlayNext() })
    }, [])

    const resetSlotQueue = useCallback(() => {
        slotMapRef.current.clear()
        nextPlayIndexRef.current = 0
        totalSlotsRef.current = 0
        isPlayingRef.current = false
        streamDoneRef.current = false
        ttsQueueRef.current = []
        isTtsProcessingRef.current = false
        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.src = ''
            audioRef.current = null
        }
    }, [])

    // ── ⚡ 순차 TTS 큐 — Concurrency 1 완벽 잠금 ──
    // 앞선 요청이 "완전히 끝나야" 다음 요청 시작
    const processTtsQueue = useCallback(async (controller: AbortController) => {
        if (isTtsProcessingRef.current) return  // Lock 걸려있으면 진입 불가
        isTtsProcessingRef.current = true

        while (ttsQueueRef.current.length > 0) {
            if (controller.signal.aborted) break
            const { sentence, slotIndex } = ttsQueueRef.current.shift()!

            try {
                const res = await fetch('/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: sentence, mentorName, voiceId: safeVoiceId }),
                    signal: controller.signal,
                })

                if (controller.signal.aborted) break

                if (res.ok) {
                    const data = await res.json()
                    if (data?.audioUrl) {
                        slotMapRef.current.set(slotIndex, data.audioUrl)
                        tryPlayNext()
                    } else {
                        slotMapRef.current.delete(slotIndex)
                        nextPlayIndexRef.current = Math.max(nextPlayIndexRef.current, slotIndex + 1)
                        tryPlayNext()
                    }
                } else if (res.status === 429) {
                    // 429 → 500ms 후 1회 재시도, 실패 시 스킵
                    await new Promise(r => setTimeout(r, 500))
                    try {
                        const retry = await fetch('/api/tts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text: sentence, mentorName, voiceId: safeVoiceId }),
                            signal: controller.signal,
                        })
                        if (retry.ok) {
                            const retryData = await retry.json()
                            if (retryData?.audioUrl) {
                                slotMapRef.current.set(slotIndex, retryData.audioUrl)
                                tryPlayNext()
                                continue
                            }
                        }
                    } catch { /* skip */ }
                    slotMapRef.current.delete(slotIndex)
                    nextPlayIndexRef.current = Math.max(nextPlayIndexRef.current, slotIndex + 1)
                    tryPlayNext()
                } else {
                    slotMapRef.current.delete(slotIndex)
                    nextPlayIndexRef.current = Math.max(nextPlayIndexRef.current, slotIndex + 1)
                    tryPlayNext()
                }
            } catch (e: any) {
                if (e?.name === 'AbortError') break
                slotMapRef.current.delete(slotIndex)
                nextPlayIndexRef.current = Math.max(nextPlayIndexRef.current, slotIndex + 1)
                tryPlayNext()
            }
        }

        isTtsProcessingRef.current = false  // Lock 해제
        if (streamDoneRef.current) tryPlayNext()
    }, [mentorName, safeVoiceId, tryPlayNext])

    const enqueueTts = useCallback((sentence: string, slotIndex: number, controller: AbortController) => {
        slotMapRef.current.set(slotIndex, null) // 슬롯 예약
        ttsQueueRef.current.push({ sentence, slotIndex })
        processTtsQueue(controller)
    }, [processTtsQueue])

    // ── 📞 인사말: 프리패칭 대신 큐 1순위로 통합 ──
    // 프리패칭 제거! → 인사말도 동일한 TTS 큐에 넣어서 충돌 원천 차단
    const playGreeting = useCallback(async () => {
        setPhase('speaking')
        const controller = new AbortController()
        abortRef.current = controller

        resetSlotQueue()
        const displayName = userName || '고객'
        const greetingText = `네, ${displayName}님! ${mentorName}입니다, 반갑습니다!`

        // 인사말을 큐의 0번 슬롯으로 넣기 — 프리패칭 충돌 없음!
        totalSlotsRef.current = 1
        streamDoneRef.current = true
        enqueueTts(greetingText, 0, controller)
    }, [userName, mentorName, enqueueTts, resetSlotQueue])

    // 🔒 통화 전 사용량 체크
    useEffect(() => {
        if (isOpen) {
            setCallDuration(0)
            // 사용량 조회
            fetch('/api/voice-usage').then(r => r.json()).then(data => {
                if (data.expired) {
                    setVoiceExpired(true)
                    setPhase('expired')
                    return
                }
                setRemainingSeconds(data.remainingSeconds || 180)
                // 이번 통화 최대 시간: min(60초, 남은 시간)
                maxCallSecondsRef.current = Math.min(60, data.remainingSeconds || 60)
                setPhase('connecting')
                timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
                setTimeout(() => playGreeting(), 300)
            }).catch(() => {
                // API 실패 시 그냥 60초 제한으로 진행
                setPhase('connecting')
                timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
                setTimeout(() => playGreeting(), 300)
            })
        } else {
            if (timerRef.current) clearInterval(timerRef.current)
            stopAll()
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current)
            abortRef.current?.abort(); recognitionRef.current?.stop(); resetSlotQueue()
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        }
    }, [isOpen])

    // ⏱️ 1분 자동 종료
    useEffect(() => {
        if (callDuration > 0 && callDuration >= maxCallSecondsRef.current && phase !== 'expired' && phase !== 'idle') {
            console.log(`[VoiceCall] ⏱️ ${maxCallSecondsRef.current}초 도달 → 자동 종료`)
            stopAll()
            // 사용량 업데이트
            fetch('/api/voice-usage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secondsUsed: callDuration }),
            }).catch(() => {})
            setPhase('expired')
            setError('⏱️ 1분 무료체험이 종료되었습니다')
        }
    }, [callDuration])

    const formatDuration = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

    const stopAll = useCallback(() => {
        abortRef.current?.abort(); abortRef.current = null
        recognitionRef.current?.stop(); resetSlotQueue()
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        setPhase('idle')
    }, [resetSlotQueue])

    const startIdleTimer = useCallback(() => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
        idleTimerRef.current = setTimeout(async () => {
            setPhase('speaking')
            const controller = new AbortController()
            abortRef.current = controller
            resetSlotQueue()
            totalSlotsRef.current = 1
            streamDoneRef.current = true
            enqueueTts('아직 계세요? 궁금한 게 있으면 편하게 말씀해 주세요!', 0, controller)
        }, 15000)
    }, [enqueueTts, resetSlotQueue])

    // ── 🛑 끼어들기 — 3중 abort ──
    const interruptSpeaking = useCallback(() => {
        abortRef.current?.abort(); abortRef.current = null
        resetSlotQueue()
        setPhase('listening')
    }, [resetSlotQueue])

    // ── 👂 음성 인식 ──
    const startListening = useCallback(() => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (!SR) { setError('이 브라우저에서 음성 인식을 지원하지 않아요'); return }
        setPhase('listening'); setTranscript(''); setError(null); startIdleTimer()

        const recognition = new SR()
        recognition.lang = 'ko-KR'; recognition.continuous = true; recognition.interimResults = true
        let finalText = ''

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
            let interim = ''
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript
                if (event.results[i].isFinal) finalText += t; else interim = t
            }
            setTranscript(finalText + interim)
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
            if (finalText) {
                silenceTimerRef.current = setTimeout(() => { recognition.stop(); handleSendAndSpeak(finalText) }, 500)
            }
        }
        recognition.onerror = (e: any) => {
            if (e.error === 'no-speech') setTimeout(() => startListening(), 500)
            else if (e.error === 'not-allowed') { setError('마이크 권한이 필요해요'); setPhase('idle') }
        }
        recognition.onend = () => {}
        try { recognition.start(); recognitionRef.current = recognition } catch { setError('음성 인식 시작 실패'); setPhase('idle') }
    }, [phase, startIdleTimer])

    // ── 🛑 끼어들기 감지 — isFinal + 2글자 ──
    const startInterruptionDetection = useCallback(() => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (!SR) return
        const recognition = new SR()
        recognition.lang = 'ko-KR'; recognition.continuous = true; recognition.interimResults = false
        recognition.onresult = (event: SpeechRecognitionEvent) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i][0].transcript.trim().length >= 2) {
                    interruptSpeaking(); recognition.stop()
                    setTimeout(() => startListening(), 100); return
                }
            }
        }
        recognition.onerror = () => {}; recognition.onend = () => {}
        try { recognition.start(); recognitionRef.current = recognition } catch { /* ignore */ }
    }, [interruptSpeaking, startListening])

    // ── 🗣️ 스트리밍 → fire TTS → ordered slot 큐 ──
    const handleSendAndSpeak = useCallback(async (text: string) => {
        if (!text.trim()) { startListening(); return }
        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        resetSlotQueue()
        setPhase('thinking')

        try {
            let sentenceIndex = 0
            let firstFired = false

            const onSentence = (sentence: string) => {
                if (controller.signal.aborted) return
                if (!firstFired) {
                    firstFired = true
                    setPhase('speaking')
                    startInterruptionDetection()
                }
                const idx = sentenceIndex++
                totalSlotsRef.current = sentenceIndex
                enqueueTts(sentence, idx, controller)
            }

            await onStreamMessage(text, onSentence, controller.signal)

            if (!controller.signal.aborted) {
                streamDoneRef.current = true
                totalSlotsRef.current = sentenceIndex
                if (sentenceIndex === 0) { setPhase('listening'); startListening() }
                else tryPlayNext()
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') return
            setError('대화 중 오류가 발생했어요')
            setTimeout(() => { setError(null); setPhase('listening'); startListening() }, 2000)
        }
    }, [onStreamMessage, startListening, startInterruptionDetection, enqueueTts, resetSlotQueue, tryPlayNext])

    const handleHangup = useCallback(() => {
        stopAll()
        // 🔒 통화 종료 시 사용량 업데이트
        if (callDuration > 0) {
            fetch('/api/voice-usage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secondsUsed: callDuration }),
            }).catch(() => {})
        }
        onClose()
    }, [stopAll, onClose, callDuration])

    if (!isOpen) return null

    const ringColor = phase === 'speaking' ? 'rgba(249,115,22,0.2)' : phase === 'listening' ? 'rgba(59,130,246,0.15)' : phase === 'thinking' ? 'rgba(251,191,36,0.15)' : 'rgba(229,231,235,0.5)'
    const statusText = phase === 'connecting' ? '연결 중...' : phase === 'listening' ? '듣고 있어요...' : phase === 'thinking' ? '생각 중...' : phase === 'speaking' ? '말하는 중' : ''
    const statusDots = phase === 'listening' ? (
        <span style={{ display: 'inline-flex', gap: 3, marginLeft: 6 }}>{[0,1,2].map(i => <span key={i} style={{ width:6,height:6,borderRadius:'50%',backgroundColor:'#3b82f6',animation:`voicePulse 1.2s ease-in-out ${i*.2}s infinite` }} />)}</span>
    ) : phase === 'speaking' ? (
        <span style={{ display: 'inline-flex', gap: 2, marginLeft: 6, alignItems: 'center' }}>{[0,1,2].map(i => <span key={i} style={{ width:4,height:14+i*4,borderRadius:2,backgroundColor:'#f97316',animation:`voiceWave 0.8s ease-in-out ${i*.15}s infinite alternate` }} />)}</span>
    ) : phase === 'thinking' ? (
        <span style={{ display: 'inline-flex', gap: 3, marginLeft: 6 }}>{[0,1,2].map(i => <span key={i} style={{ width:6,height:6,borderRadius:'50%',backgroundColor:'#fbbf24',animation:`voicePulse 1s ease-in-out ${i*.3}s infinite` }} />)}</span>
    ) : null

    return (
        <div style={{ position:'fixed',inset:0,zIndex:9999,background:'#F9FAFB',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center' }}>
            <style>{`@keyframes voicePulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}@keyframes voiceWave{0%{transform:scaleY(.5)}100%{transform:scaleY(1.3)}}@keyframes ringPulse{0%{box-shadow:0 0 0 0 rgba(249,115,22,.3)}100%{box-shadow:0 0 0 20px rgba(249,115,22,0)}}`}</style>
            <div style={{ width:180,height:180,borderRadius:'50%',border:`6px solid ${ringColor}`,overflow:'hidden',animation:phase==='speaking'?'ringPulse 1.5s ease-in-out infinite':'none',display:'flex',alignItems:'center',justifyContent:'center',backgroundColor:'#fff' }}>
                {mentorImage ? <img src={mentorImage} alt={mentorName} style={{ width:'100%',height:'100%',objectFit:'cover' }} /> : <span style={{ fontSize:64 }}>{mentorEmoji}</span>}
            </div>
            <h2 style={{ fontSize:24,fontWeight:700,color:'#111',margin:'20px 0 8px' }}>{mentorName}</h2>
            <div style={{ display:'flex',alignItems:'center',padding:'6px 16px',borderRadius:20,background:phase==='speaking'?'rgba(249,115,22,0.08)':phase==='expired'?'rgba(239,68,68,0.08)':'rgba(0,0,0,0.04)',color:phase==='speaking'?'#f97316':phase==='expired'?'#ef4444':'#666',fontSize:14,fontWeight:500 }}>{phase === 'expired' ? '무료체험 종료' : statusText} {statusDots}</div>
            <p style={{ color:'#aaa',fontSize:14,marginTop:8 }}>{formatDuration(callDuration)}{phase !== 'expired' && phase !== 'idle' ? ` / ${formatDuration(maxCallSecondsRef.current)}` : ''}</p>
            {voiceExpired && phase === 'expired' && (
                <div style={{ margin:'20px 24px 0',padding:'16px 20px',borderRadius:16,background:'linear-gradient(135deg,#FEF2F2,#FFF7ED)',border:'1px solid #FECACA',maxWidth:320,textAlign:'center' }}>
                    <p style={{ fontSize:16,fontWeight:700,color:'#DC2626',marginBottom:8 }}>📞 무료체험이 종료되었어요</p>
                    <p style={{ fontSize:13,color:'#666',lineHeight:1.5 }}>총 3분의 무료 음성통화를 모두 사용하셨습니다.<br/>텍스트 채팅은 계속 이용 가능합니다!</p>
                </div>
            )}
            {transcript && !voiceExpired && <div style={{ margin:'20px 24px 0',padding:'12px 16px',borderRadius:12,background:'#fff',border:'1px solid #e5e7eb',maxWidth:300,fontSize:14,color:'#374151',textAlign:'center',maxHeight:80,overflow:'hidden' }}>{transcript}</div>}
            {error && <div style={{ margin:'12px 24px 0',padding:'8px 16px',borderRadius:8,background:'#FEF2F2',color:'#DC2626',fontSize:13,textAlign:'center' }}>{error}</div>}
            <button onClick={handleHangup} style={{ position:'absolute',bottom:60,width:64,height:64,borderRadius:'50%',background:'#EF4444',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 12px rgba(239,68,68,0.3)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>
            </button>
        </div>
    )
}
