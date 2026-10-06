'use client'

import { useState, useCallback, useRef } from 'react'

// 미리 듣기 문구는 서버(/api/tts)가 정한다. 여기엔 지원하는 기본 봇 이름만 둔다.
const PREVIEW_NAMES = ['열정진', '글담쌤', 'Cathy', '봉이 김선달', '신사임당']

export default function VoicePreviewButton({ mentorId, mentorName }: { mentorId: string; mentorName: string }) {
    // 🎵 음성 미리듣기가 지원되는 기본 멘토만 표시
    if (!PREVIEW_NAMES.includes(mentorName)) return null

    const [status, setStatus] = useState<'idle' | 'loading' | 'playing'>('idle')
    const audioRef = useRef<HTMLAudioElement | null>(null)
    const cacheRef = useRef<Map<string, string>>(new Map())

    const handleClick = useCallback(async (e: React.MouseEvent) => {
        e.preventDefault() // Link 클릭 방지
        e.stopPropagation()

        // 🔒 비회원이면 로그인 유도
        try {
            const authRes = await fetch('/api/auth/me')
            const authData = await authRes.json()
            if (!authData?.user) {
                window.location.href = '/login'
                return
            }
        } catch {
            window.location.href = '/login'
            return
        }

        if (status === 'playing' && audioRef.current) {
            audioRef.current.pause()
            audioRef.current.currentTime = 0
            setStatus('idle')
            return
        }

        if (status === 'loading') return

        setStatus('loading')

        try {
            let audioUrl = cacheRef.current.get(mentorName)

            if (!audioUrl) {
                const res = await fetch('/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mentorId, preview: true }),
                })

                if (!res.ok) throw new Error('TTS 실패')

                const data = await res.json()
                audioUrl = data.audioUrl
                if (audioUrl) cacheRef.current.set(mentorName, audioUrl)
            }

            if (!audioUrl) throw new Error('URL 없음')

            const audio = new Audio(audioUrl)
            audioRef.current = audio
            audio.onended = () => setStatus('idle')
            audio.onerror = () => setStatus('idle')
            await audio.play()
            setStatus('playing')
        } catch (err) {
            console.error('[Voice Preview]', err)
            setStatus('idle')
        }
    }, [status, mentorName])

    return (
        <button
            onClick={handleClick}
            disabled={status === 'loading'}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 14px',
                borderRadius: 20,
                border: status === 'playing' ? '1.5px solid #22c55e' : '1.5px solid #e5e7eb',
                background: status === 'playing' ? '#f0fdf4' : '#fff',
                color: status === 'playing' ? '#16a34a' : status === 'loading' ? '#9ca3af' : '#6b7280',
                fontSize: 12,
                fontWeight: 600,
                cursor: status === 'loading' ? 'wait' : 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
            }}
            title="목소리 미리 듣기"
        >
            {status === 'loading' ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="8" cy="8" r="6" opacity="0.25" />
                    <path d="M14 8a6 6 0 01-6 6" strokeLinecap="round">
                        <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.8s" repeatCount="indefinite" />
                    </path>
                </svg>
            ) : status === 'playing' ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="3" y="3" width="10" height="10" rx="2" />
                </svg>
            ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 3L4.5 5.5H2v5h2.5L8 13V3z" />
                    <path d="M11 5.5a3.5 3.5 0 010 5" />
                </svg>
            )}
            {status === 'playing' ? '정지' : status === 'loading' ? '생성 중...' : '🎵 목소리 듣기'}
        </button>
    )
}
