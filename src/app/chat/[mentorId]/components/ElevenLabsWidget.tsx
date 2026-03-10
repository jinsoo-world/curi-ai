'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useConversation } from '@elevenlabs/react'

/**
 * ElevenLabs 음성 대화 — React SDK v0.14.1
 * SDK Callbacks 타입:
 *   onConnect: ({ conversationId: string }) => void
 *   onDisconnect: (DisconnectionDetails) => void
 *   onMessage: ({ message: string, role: 'user'|'agent', source: 'user'|'ai' }) => void
 *   onStatusChange: ({ status: 'disconnected'|'connecting'|'connected'|'disconnecting' }) => void
 *   onModeChange: ({ mode: 'speaking'|'listening' }) => void
 *   onError: (message: string, context?: any) => void
 */

interface ElevenLabsWidgetProps {
    agentId: string
    mentorName: string
    mentorImage?: string
    mentorEmoji: string
    isOpen: boolean
    onClose: () => void
}

export default function ElevenLabsWidget({
    agentId,
    mentorName,
    mentorImage,
    mentorEmoji,
    isOpen,
    onClose,
}: ElevenLabsWidgetProps) {
    const [transcript, setTranscript] = useState<Array<{ role: string; text: string }>>([])
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [manualStatus, setManualStatus] = useState<string>('idle')
    const [manualSpeaking, setManualSpeaking] = useState(false)
    const hasStartedRef = useRef(false)
    const isStartingRef = useRef(false)

    const conversation = useConversation({
        onConnect: ({ conversationId }) => {
            console.log('[ElevenLabs] ✅ Connected, conversationId:', conversationId)
            setManualStatus('connected')
            setErrorMsg(null)
        },
        onDisconnect: (details: any) => {
            console.log('[ElevenLabs] 🔌 Disconnected:', details)
            setManualStatus('disconnected')
            setManualSpeaking(false)
            // 끊김 사유 분석
            const reason = details?.reason || ''
            const closeReason = details?.closeReason || details?.message || ''
            if (closeReason.includes('quota') || closeReason.includes('limit')) {
                setErrorMsg('음성 통화 크레딧이 소진되었어요. ElevenLabs 대시보드에서 크레딧을 확인해주세요.')
            } else if (reason === 'error') {
                setErrorMsg(`통화가 끊겼어요: ${closeReason || '알 수 없는 오류'}`)
            }
        },
        onMessage: ({ message, role }) => {
            console.log(`[ElevenLabs] 📩 [${role}]: ${message}`)
            setTranscript(prev => [...prev, { role, text: message }])
            // 메시지 수신 = 연결 확인
            if (manualStatus !== 'connected') setManualStatus('connected')
        },
        onError: (message, context) => {
            console.error('[ElevenLabs] ❌ Error:', message, context)
            setErrorMsg(`연결 오류: ${message}`)
        },
        onStatusChange: ({ status: newStatus }) => {
            console.log('[ElevenLabs] 🔄 Status:', newStatus)
            setManualStatus(newStatus)
        },
        onModeChange: ({ mode }) => {
            console.log('[ElevenLabs] 🎙️ Mode:', mode)
            setManualSpeaking(mode === 'speaking')
            if (manualStatus !== 'connected') setManualStatus('connected')
        },
    })

    const { status: sdkStatus, isSpeaking: sdkIsSpeaking } = conversation

    // 실제 연결 상태: SDK + 수동 추적 결합
    const isConnected = sdkStatus === 'connected' || manualStatus === 'connected'
    const isAgentSpeaking = sdkIsSpeaking || manualSpeaking

    // isSpeaking이 true면 연결된 것
    useEffect(() => {
        if (sdkIsSpeaking && manualStatus !== 'connected') {
            setManualStatus('connected')
        }
    }, [sdkIsSpeaking, manualStatus])

    // 열릴 때 세션 시작
    useEffect(() => {
        if (!isOpen) return
        if (hasStartedRef.current || isStartingRef.current) return

        isStartingRef.current = true
        setTranscript([])
        setErrorMsg(null)
        setManualStatus('connecting')

        const startCall = async () => {
            try {
                console.log('[ElevenLabs] 🎤 Requesting microphone...')
                await navigator.mediaDevices.getUserMedia({ audio: true })
                console.log('[ElevenLabs] 🎤 Microphone OK, starting session...')

                const convId = await conversation.startSession({
                    agentId,
                    connectionType: 'websocket',
                })
                console.log('[ElevenLabs] 🆔 Session started:', convId)
                hasStartedRef.current = true
            } catch (err: any) {
                console.error('[ElevenLabs] ❌ Failed:', err)
                isStartingRef.current = false
                setManualStatus('error')

                if (err?.name === 'NotAllowedError') {
                    setErrorMsg('마이크 권한이 거부되었어요. 브라우저 설정에서 마이크를 허용해주세요.')
                } else if (err?.name === 'NotFoundError') {
                    setErrorMsg('마이크를 찾을 수 없어요. 마이크가 연결되어 있는지 확인해주세요.')
                } else {
                    setErrorMsg(`연결 실패: ${err?.message || err}`)
                }
            }
        }
        startCall()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, agentId])

    // 닫기
    const handleClose = useCallback(async () => {
        try {
            await conversation.endSession()
        } catch (e) {
            console.error('[ElevenLabs] End session error:', e)
        }
        hasStartedRef.current = false
        isStartingRef.current = false
        setManualStatus('idle')
        setManualSpeaking(false)
        setTranscript([])
        setErrorMsg(null)
        onClose()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onClose])

    // ESC 키
    useEffect(() => {
        if (!isOpen) return
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose()
        }
        document.addEventListener('keydown', handleKey)
        return () => document.removeEventListener('keydown', handleKey)
    }, [isOpen, handleClose])

    // 스크롤 방지
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => { document.body.style.overflow = '' }
    }, [isOpen])

    if (!isOpen) return null

    // === UI ===

    const getStatusText = () => {
        if (errorMsg) return errorMsg
        if (isConnected && isAgentSpeaking) return `${mentorName}가 말하고 있어요...`
        if (isConnected) return '듣고 있어요... 말해보세요!'
        return '연결 중...'
    }

    const getOrbStyle = (): React.CSSProperties => {
        if (errorMsg) {
            return {
                background: 'radial-gradient(circle, #fca5a5 0%, #ef4444 50%, #dc2626 100%)',
                boxShadow: '0 0 60px rgba(239,68,68,0.3)',
                animation: 'orbIdle 4s ease-in-out infinite',
                transform: 'scale(0.95)',
            }
        }
        if (isConnected && isAgentSpeaking) {
            return {
                background: `
                    radial-gradient(circle at 35% 35%, rgba(74,222,128,0.9) 0%, transparent 50%),
                    radial-gradient(circle at 65% 55%, rgba(34,197,94,0.8) 0%, transparent 50%),
                    radial-gradient(circle, #22c55e 0%, #16a34a 50%, #15803d 100%)
                `,
                boxShadow: `0 0 80px rgba(34,197,94,0.5), 0 0 160px rgba(74,222,128,0.3), inset 0 0 60px rgba(255,255,255,0.15)`,
                animation: 'orbSpeaking 0.8s ease-in-out infinite, orbGlowGreen 2s ease-in-out infinite',
                transform: 'scale(1.1)',
            }
        }
        if (isConnected) {
            return {
                background: `
                    radial-gradient(circle at 35% 35%, rgba(34,197,94,0.7) 0%, transparent 60%),
                    radial-gradient(circle at 65% 65%, rgba(22,163,74,0.5) 0%, transparent 60%),
                    radial-gradient(circle, #4ade80 0%, #22c55e 30%, #16a34a 60%, #15803d 100%)
                `,
                boxShadow: `0 0 60px rgba(34,197,94,0.3), 0 0 120px rgba(22,163,74,0.2), inset 0 0 60px rgba(255,255,255,0.1)`,
                animation: 'orbListening 2s ease-in-out infinite',
                transform: 'scale(1)',
            }
        }
        return {
            background: `
                radial-gradient(circle at 35% 35%, rgba(34,197,94,0.5) 0%, transparent 60%),
                radial-gradient(circle at 65% 65%, rgba(22,163,74,0.3) 0%, transparent 60%),
                radial-gradient(circle, #4ade80 0%, #22c55e 40%, #16a34a 100%)
            `,
            boxShadow: `0 0 40px rgba(34,197,94,0.15), 0 0 80px rgba(22,163,74,0.08)`,
            animation: 'orbConnecting 1.5s ease-in-out infinite',
            transform: 'scale(0.95)',
        }
    }

    return (
        <div
            style={{
                position: 'fixed',
                top: 0, left: 0, right: 0, bottom: 0,
                zIndex: 99999,
                background: '#faf8f5',
                display: 'flex',
                flexDirection: 'column',
                animation: 'fadeInCall 0.3s ease',
            }}
        >
            {/* 헤더 */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 24px',
                borderBottom: '1px solid #eee',
                background: '#fff',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                        onClick={handleClose}
                        style={{
                            background: 'none', border: 'none',
                            fontSize: 20, cursor: 'pointer',
                            padding: '4px 8px', color: '#18181b',
                        }}
                    >
                        ←
                    </button>
                    {mentorImage ? (
                        <img src={mentorImage} alt={mentorName}
                            style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                        />
                    ) : (
                        <img src="/logo.png" alt="큐리 AI"
                            style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
                        />
                    )}
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 18, color: '#18181b', lineHeight: 1.3 }}>
                            {mentorName}
                        </div>
                        <div style={{
                            fontSize: 13,
                            color: errorMsg ? '#ef4444' : isConnected ? '#22c55e' : '#a1a1aa',
                            fontWeight: 500,
                            display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                            {isConnected && !errorMsg && (
                                <span style={{
                                    display: 'inline-block', width: 6, height: 6,
                                    borderRadius: '50%', background: '#22c55e',
                                    animation: 'pulseSoft 1.5s ease-in-out infinite',
                                }} />
                            )}
                            {errorMsg ? '연결 오류' : isConnected ? '음성 통화 중' : '연결 중...'}
                        </div>
                    </div>
                </div>
                <button
                    onClick={handleClose}
                    style={{
                        background: 'none', border: '1px solid #e4e4e7',
                        borderRadius: 8, padding: '6px 14px',
                        fontSize: 15, color: '#52525b',
                        cursor: 'pointer', fontWeight: 500,
                    }}
                >
                    통화 종료
                </button>
            </header>

            {/* 메인 */}
            <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 24, padding: '0 24px',
            }}>
                {/* 오브 */}
                <div style={{
                    width: 200, height: 200, borderRadius: '50%',
                    transition: 'transform 0.5s ease, box-shadow 0.5s ease',
                    position: 'relative',
                    ...getOrbStyle(),
                }}>
                    <div style={{
                        position: 'absolute', top: '15%', left: '20%',
                        width: '40%', height: '40%', borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(255,255,255,0.35) 0%, transparent 70%)',
                        filter: 'blur(8px)',
                    }} />
                </div>

                {/* 이름 + 상태 */}
                <div style={{ textAlign: 'center', maxWidth: 400 }}>
                    <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: '#18181b', marginBottom: 8 }}>
                        {mentorName}
                    </h2>
                    <p style={{
                        margin: 0, fontSize: 15,
                        color: errorMsg ? '#ef4444' : '#71717a',
                        lineHeight: 1.5,
                    }}>
                        {getStatusText()}
                    </p>
                    {process.env.NODE_ENV === 'development' && (
                        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#d4d4d8' }}>
                            sdk:{sdkStatus} manual:{manualStatus} speaking:{String(isAgentSpeaking)}
                        </p>
                    )}
                </div>

                {/* 에러 재시도 */}
                {errorMsg && (
                    <button
                        onClick={() => {
                            setErrorMsg(null)
                            hasStartedRef.current = false
                            isStartingRef.current = false
                        }}
                        style={{
                            padding: '10px 24px', borderRadius: 50,
                            background: '#22c55e', border: 'none',
                            color: '#fff', fontSize: 15, fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        다시 연결하기
                    </button>
                )}

                {/* 트랜스크립트 */}
                {transcript.length > 0 && (
                    <div style={{
                        maxWidth: 480, width: '100%',
                        maxHeight: 200, overflowY: 'auto',
                        display: 'flex', flexDirection: 'column', gap: 8,
                        padding: '16px',
                        background: '#fff', borderRadius: 20,
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                    }}>
                        {transcript.slice(-6).map((msg, i) => (
                            <div key={i} style={{
                                display: 'flex',
                                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            }}>
                                <span style={{
                                    fontSize: 14, color: '#18181b',
                                    background: msg.role === 'user' ? '#dcfce7' : '#f0ede8',
                                    padding: '8px 14px', borderRadius: 16,
                                    maxWidth: '80%', lineHeight: 1.5,
                                }}>
                                    {msg.text}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* 전화 끊기 */}
                <button
                    onClick={handleClose}
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '14px 32px', borderRadius: 50,
                        background: '#ef4444', border: 'none',
                        color: '#fff', fontSize: 16, fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 4px 20px rgba(239,68,68,0.3)',
                    }}
                >
                    📞 전화 끊기
                </button>
            </div>

            {/* 하단 */}
            <div style={{
                padding: '16px 24px', textAlign: 'center',
                borderTop: '1px solid #eee', background: '#fff',
            }}>
                <p style={{ margin: 0, fontSize: 12, color: '#a1a1aa' }}>
                    Powered by ElevenLabs · 큐리 AI
                </p>
            </div>

            <style>{`
                @keyframes fadeInCall { from { opacity: 0; } to { opacity: 1; } }
                @keyframes orbIdle { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.03); } }
                @keyframes orbConnecting { 0%, 100% { transform: scale(0.95); opacity: 0.7; } 50% { transform: scale(1.0); opacity: 1; } }
                @keyframes orbListening { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.06); opacity: 0.9; } }
                @keyframes orbSpeaking { 0%, 100% { transform: scale(1.08); } 50% { transform: scale(1.15); } }
                @keyframes orbGlowGreen { 0%, 100% { box-shadow: 0 0 80px rgba(34,197,94,0.5), 0 0 160px rgba(74,222,128,0.3); } 50% { box-shadow: 0 0 100px rgba(34,197,94,0.6), 0 0 200px rgba(74,222,128,0.4); } }
                @keyframes pulseSoft { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
            `}</style>
        </div>
    )
}
