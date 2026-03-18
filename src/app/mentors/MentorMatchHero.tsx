'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

const PLACEHOLDER_CONCERNS = [
    '돈 버는 콘텐츠를 만들고 싶어요',
    '사는 게 답답하고 막막해요',
    '물건을 잘 파는 방법이 궁금해요',
    '새로운 도전을 해보고 싶은데...',
    '퍼스널 브랜딩을 시작하고 싶어요',
]

interface MatchResult {
    mentor: {
        id: string
        name: string
        title: string
        avatar_url?: string
    }
    reason: string
    firstMessage: string
}

export default function MentorMatchHero() {
    const [concern, setConcern] = useState('')
    const [isMatching, setIsMatching] = useState(false)
    const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
    const [placeholderIdx, setPlaceholderIdx] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const router = useRouter()

    // 플레이스홀더 순환
    const rotatePlaceholder = useCallback(() => {
        setPlaceholderIdx(prev => (prev + 1) % PLACEHOLDER_CONCERNS.length)
    }, [])

    const handleMatch = async () => {
        const text = concern.trim()
        if (!text || text.length < 2 || isMatching) return

        setIsMatching(true)
        setMatchResult(null)

        try {
            const res = await fetch('/api/mentor-match', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ concern: text }),
            })
            const data = await res.json()
            if (data.mentor) {
                setMatchResult(data)
            }
        } catch {
            // 실패 시 무시
        } finally {
            setIsMatching(false)
        }
    }

    const startChat = () => {
        if (!matchResult) return
        // 고민을 쿼리로 전달 → 채팅에서 자동 전송
        const encoded = encodeURIComponent(concern.trim())
        router.push(`/chat/${matchResult.mentor.id}?auto_msg=${encoded}`)
    }

    return (
        <div style={{
            maxWidth: 1000, margin: '0 auto',
            padding: '40px 40px 16px',
        }}>
            {/* 메인 카드 */}
            <div style={{
                background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 50%, #f0f9ff 100%)',
                borderRadius: 24,
                padding: '36px 32px',
                border: '1px solid #d1fae5',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* 배경 장식 */}
                <div style={{
                    position: 'absolute', top: -40, right: -40,
                    width: 180, height: 180, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(34,197,94,0.08) 0%, transparent 70%)',
                }} />

                <h2 style={{
                    fontSize: 22, fontWeight: 800, color: '#1e293b',
                    margin: '0 0 6px', lineHeight: 1.4,
                }}>
                    🎯 고민 한 줄이면 AI가 멘토를 찾아드려요
                </h2>
                <p style={{
                    fontSize: 14, color: '#64748b', margin: '0 0 20px',
                }}>
                    어떤 고민이든 적어보세요. 3초 안에 딱 맞는 멘토를 매칭해드릴게요.
                </p>

                {/* 입력 영역 */}
                {!matchResult && (
                    <div style={{
                        display: 'flex', gap: 10,
                        animation: 'slideUp 0.3s ease',
                    }}>
                        <input
                            ref={inputRef}
                            type="text"
                            value={concern}
                            onChange={e => setConcern(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleMatch()}
                            onFocus={rotatePlaceholder}
                            placeholder={PLACEHOLDER_CONCERNS[placeholderIdx]}
                            disabled={isMatching}
                            style={{
                                flex: 1,
                                padding: '14px 18px',
                                borderRadius: 14,
                                border: '2px solid #d1fae5',
                                background: '#fff',
                                fontSize: 15,
                                color: '#1e293b',
                                outline: 'none',
                                transition: 'border-color 0.2s',
                            }}
                        />
                        <button
                            onClick={handleMatch}
                            disabled={!concern.trim() || isMatching}
                            style={{
                                padding: '14px 24px',
                                borderRadius: 14,
                                border: 'none',
                                background: isMatching
                                    ? '#94a3b8'
                                    : 'linear-gradient(135deg, #22c55e, #16a34a)',
                                color: '#fff',
                                fontSize: 15,
                                fontWeight: 700,
                                cursor: concern.trim() && !isMatching ? 'pointer' : 'not-allowed',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.2s',
                                boxShadow: concern.trim() && !isMatching
                                    ? '0 4px 14px rgba(34,197,94,0.3)'
                                    : 'none',
                            }}
                        >
                            {isMatching ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{
                                        width: 16, height: 16, borderRadius: '50%',
                                        border: '2px solid rgba(255,255,255,0.3)',
                                        borderTopColor: '#fff',
                                        animation: 'spin 0.8s linear infinite',
                                        display: 'inline-block',
                                    }} />
                                    매칭 중...
                                </span>
                            ) : '멘토 찾기 ✦'}
                        </button>
                    </div>
                )}

                {/* 매칭 결과 */}
                {matchResult && (
                    <div style={{
                        animation: 'slideUp 0.4s ease',
                        background: '#fff',
                        borderRadius: 18,
                        padding: '24px',
                        border: '2px solid #22c55e30',
                        boxShadow: '0 8px 30px rgba(34,197,94,0.12)',
                    }}>
                        {/* 매칭 뱃지 */}
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: '#f0fdf4', border: '1px solid #bbf7d0',
                            borderRadius: 20, padding: '4px 14px',
                            fontSize: 12, fontWeight: 700, color: '#16a34a',
                            marginBottom: 16,
                        }}>
                            ✨ AI 매칭 완료 — {matchResult.reason}
                        </div>

                        {/* 멘토 정보 */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 16,
                            marginBottom: 16,
                        }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: 18,
                                overflow: 'hidden', flexShrink: 0,
                                border: '3px solid #22c55e20',
                                background: '#f0fdf4',
                            }}>
                                {matchResult.mentor.avatar_url ? (
                                    <Image
                                        src={matchResult.mentor.avatar_url}
                                        alt={matchResult.mentor.name}
                                        width={64} height={64}
                                        style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                                    />
                                ) : (
                                    <div style={{
                                        width: '100%', height: '100%',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 28,
                                    }}>🤖</div>
                                )}
                            </div>
                            <div>
                                <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>
                                    {matchResult.mentor.name}
                                </div>
                                <div style={{ fontSize: 13, color: '#64748b' }}>
                                    {matchResult.mentor.title}
                                </div>
                            </div>
                        </div>

                        {/* 첫 메시지 미리보기 */}
                        {matchResult.firstMessage && (
                            <div style={{
                                background: '#f8fafc',
                                borderRadius: 14,
                                padding: '14px 18px',
                                fontSize: 14,
                                color: '#475569',
                                lineHeight: 1.6,
                                marginBottom: 16,
                                borderLeft: '3px solid #22c55e',
                            }}>
                                💬 &ldquo;{matchResult.firstMessage}&rdquo;
                            </div>
                        )}

                        {/* 버튼 */}
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={startChat}
                                style={{
                                    flex: 1,
                                    padding: '14px 20px',
                                    borderRadius: 14,
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    color: '#fff',
                                    fontSize: 16,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                                    transition: 'all 0.15s',
                                }}
                            >
                                🚀 바로 상담 시작하기
                            </button>
                            <button
                                onClick={() => {
                                    setMatchResult(null)
                                    setConcern('')
                                    setTimeout(() => inputRef.current?.focus(), 100)
                                }}
                                style={{
                                    padding: '14px 18px',
                                    borderRadius: 14,
                                    border: '1px solid #e5e7eb',
                                    background: '#fff',
                                    color: '#64748b',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                다시 찾기
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg) } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    )
}
