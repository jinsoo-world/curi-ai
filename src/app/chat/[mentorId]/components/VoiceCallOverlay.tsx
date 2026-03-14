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

    // 🔊 Ordered Slot 큐 — race condition 방어 ⭐
    const slotMapRef = useRef<Map<number, string | null>>(new Map()) // slot index → audioUrl (null = 아직 대기)
    const nextPlayIndexRef = useRef(0) // 다음 재생할 슬롯 인덱스
    const totalSlotsRef = useRef(0) // 총 발행된 슬롯 수
    const isPlayingRef = useRef(false)
    const streamDoneRef = useRef(false) // 스트림 종료 여부

    const safeVoiceId = voiceId || undefined

    // ────────────────────────────────────────────────────────────
    // 🔊 Ordered Slot 큐 매니저
    // ────────────────────────────────────────────────────────────
    const tryPlayNext = useCallback(() => {
        if (isPlayingRef.current) return

        const nextIdx = nextPlayIndexRef.current
        const audioUrl = slotMapRef.current.get(nextIdx)

        // 아직 이 슬롯 TTS 안 왔으면 대기
        if (audioUrl === undefined || audioUrl === null) {
            // 스트림 끝났고 모든 슬롯 재생 완료면 → 듣기
            if (streamDoneRef.current && nextIdx >= totalSlotsRef.current) {
                setPhase('listening')
                startListening()
            }
            return
        }

        // 이 슬롯 재생
        isPlayingRef.current = true
        nextPlayIndexRef.current = nextIdx + 1
        slotMapRef.current.delete(nextIdx) // 메모리 정리

        const audio = new Audio(audioUrl)
        audioRef.current = audio

        audio.onended = () => {
            isPlayingRef.current = false
            audioRef.current = null
            tryPlayNext()
        }
        audio.onerror = () => {
            isPlayingRef.current = false
            audioRef.current = null
            tryPlayNext()
        }
        audio.play().catch(() => {
            isPlayingRef.current = false
            tryPlayNext()
        })
    }, [])

    const resetSlotQueue = useCallback(() => {
        slotMapRef.current.clear()
        nextPlayIndexRef.current = 0
        totalSlotsRef.current = 0
        isPlayingRef.current = false
        streamDoneRef.current = false
        if (audioRef.current) {
            audioRef.current.pause()
            audioRef.current.src = ''
            audioRef.current = null
        }
    }, [])

    // ────────────────────────────────────────────────────────────
    // ⚡ Fire-and-forget TTS — 슬롯 인덱스 기반 순서 보장
    // ────────────────────────────────────────────────────────────
    const fireTts = useCallback((sentence: string, slotIndex: number, controller: AbortController) => {
        // 슬롯 예약 (null = 대기 중)
        slotMapRef.current.set(slotIndex, null)
        console.log(`[VoiceCall] 🚀 TTS fire [${slotIndex}]: "${sentence.slice(0, 30)}..."`)

        fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: sentence, mentorName, voiceId: safeVoiceId }),
            signal: controller.signal,
        })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (controller.signal.aborted) return
            if (data?.audioUrl) {
                slotMapRef.current.set(slotIndex, data.audioUrl)
                tryPlayNext() // 이 슬롯이 순서대로면 즉시 재생
            } else {
                // TTS 실패 → 이 슬롯 건너뛰기
                slotMapRef.current.delete(slotIndex)
                nextPlayIndexRef.current = Math.max(nextPlayIndexRef.current, slotIndex + 1)
                tryPlayNext()
            }
        })
        .catch((e) => {
            if (e?.name !== 'AbortError') console.error('[VoiceCall] TTS 실패:', e)
            slotMapRef.current.delete(slotIndex)
            nextPlayIndexRef.current = Math.max(nextPlayIndexRef.current, slotIndex + 1)
            tryPlayNext()
        })
    }, [mentorName, safeVoiceId, tryPlayNext])

    // ────────────────────────────────────────────────────────────
    // 📞 프리패칭
    // ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return
        prefetchedGreetingRef.current = null
        const displayName = userName || '고객'
        const greetingText = `네, ${displayName}님! ${mentorName}입니다, 반갑습니다!`

        fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: greetingText, mentorName, voiceId: safeVoiceId }),
        })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data?.audioUrl) {
                prefetchedGreetingRef.current = data.audioUrl
                new Audio(data.audioUrl).preload = 'auto'
                console.log('[VoiceCall] 🎙️ 인사말 프리패칭 완료')
            }
        })
        .catch(() => {})
    }, [isOpen, userName, mentorName, safeVoiceId])

    const playGreeting = useCallback(async () => {
        setPhase('speaking')
        if (prefetchedGreetingRef.current) {
            const audio = new Audio(prefetchedGreetingRef.current)
            audioRef.current = audio
            isPlayingRef.current = true
            audio.onended = () => { isPlayingRef.current = false; audioRef.current = null; setPhase('listening'); startListening() }
            audio.onerror = () => { isPlayingRef.current = false; audioRef.current = null; setPhase('listening'); startListening() }
            try { await audio.play() } catch { isPlayingRef.current = false; setPhase('listening'); startListening() }
        } else {
            setPhase('listening')
            startListening()
        }
    }, [])

    useEffect(() => {
        if (isOpen) {
            setCallDuration(0); setPhase('connecting')
            timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000)
            setTimeout(() => playGreeting(), 500)
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
            try {
                const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: '아직 계세요? 궁금한 게 있으면 편하게 말씀해 주세요!', mentorName, voiceId: safeVoiceId }) })
                if (r.ok) { const { audioUrl } = await r.json(); if (audioUrl) { resetSlotQueue(); slotMapRef.current.set(0, audioUrl); totalSlotsRef.current = 1; streamDoneRef.current = true; tryPlayNext(); return } }
            } catch {}
            setPhase('listening'); startListening()
        }, 15000)
    }, [mentorName, safeVoiceId, tryPlayNext, resetSlotQueue])

    const interruptSpeaking = useCallback(() => {
        console.log('[VoiceCall] 🛑 끼어들기!')
        abortRef.current?.abort(); abortRef.current = null; resetSlotQueue(); setPhase('listening')
    }, [resetSlotQueue])

    // ────────────────────────────────────────────────────────────
    // 👂 음성 인식
    // ────────────────────────────────────────────────────────────
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
        recognition.onerror = (e: any) => { if (e.error === 'no-speech') setTimeout(() => startListening(), 500); else if (e.error === 'not-allowed') { setError('마이크 권한이 필요해요'); setPhase('idle') } }
        recognition.onend = () => {}
        try { recognition.start(); recognitionRef.current = recognition } catch { setError('음성 인식 시작 실패'); setPhase('idle') }
    }, [phase, startIdleTimer])

    // ────────────────────────────────────────────────────────────
    // 🛑 끼어들기 감지 — isFinal + 2글자 (노이즈 필터)
    // ────────────────────────────────────────────────────────────
    const startInterruptionDetection = useCallback(() => {
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (!SR) return
        const recognition = new SR()
        recognition.lang = 'ko-KR'; recognition.continuous = true; recognition.interimResults = false

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const text = event.results[i][0].transcript.trim()
                if (text.length >= 2) {
                    console.log(`[VoiceCall] 🛑 진짜 끼어들기: "${text}"`)
                    interruptSpeaking(); recognition.stop()
                    setTimeout(() => startListening(), 100); return
                }
            }
        }
        recognition.onerror = () => {}; recognition.onend = () => {}
        try { recognition.start(); recognitionRef.current = recognition } catch {}
    }, [interruptSpeaking, startListening])

    // ────────────────────────────────────────────────────────────
    // 🗣️ 실시간 스트리밍 → 문장 콜백 → fire-and-forget TTS → ordered slot 큐
    // ────────────────────────────────────────────────────────────
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
                fireTts(sentence, idx, controller)
            }

            await onStreamMessage(text, onSentence, controller.signal)

            // 스트림 끝 → streamDone 표시
            if (!controller.signal.aborted) {
                streamDoneRef.current = true
                totalSlotsRef.current = sentenceIndex
                // 문장이 하나도 없었으면 듣기로
                if (sentenceIndex === 0) { setPhase('listening'); startListening() }
                else tryPlayNext() // 혹시 이미 다 왔으면 마지막 재생 트리거
            }
        } catch (err: any) {
            if (err?.name === 'AbortError') return
            console.error('[VoiceCall] 에러:', err)
            setError('대화 중 오류가 발생했어요')
            setTimeout(() => { setError(null); setPhase('listening'); startListening() }, 2000)
        }
    }, [onStreamMessage, startListening, startInterruptionDetection, fireTts, resetSlotQueue, tryPlayNext])

    const handleHangup = useCallback(() => { stopAll(); onClose() }, [stopAll, onClose])

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
            <div style={{ display:'flex',alignItems:'center',padding:'6px 16px',borderRadius:20,background:phase==='speaking'?'rgba(249,115,22,0.08)':'rgba(0,0,0,0.04)',color:phase==='speaking'?'#f97316':'#666',fontSize:14,fontWeight:500 }}>{statusText} {statusDots}</div>
            <p style={{ color:'#aaa',fontSize:14,marginTop:8 }}>{formatDuration(callDuration)}</p>
            {transcript && <div style={{ margin:'20px 24px 0',padding:'12px 16px',borderRadius:12,background:'#fff',border:'1px solid #e5e7eb',maxWidth:300,fontSize:14,color:'#374151',textAlign:'center',maxHeight:80,overflow:'hidden' }}>{transcript}</div>}
            {error && <div style={{ margin:'12px 24px 0',padding:'8px 16px',borderRadius:8,background:'#FEF2F2',color:'#DC2626',fontSize:13,textAlign:'center' }}>{error}</div>}
            <button onClick={handleHangup} style={{ position:'absolute',bottom:60,width:64,height:64,borderRadius:'50%',background:'#EF4444',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 12px rgba(239,68,68,0.3)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>
            </button>
        </div>
    )
}
