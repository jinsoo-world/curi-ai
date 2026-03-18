'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

/** 멘토 프로필 이미지 폴백 매핑 */
const MENTOR_IMAGES: Record<string, string> = {
    '열정진': '/mentors/passion-jjin.png',
    '글담쌤': '/mentors/geuldam.jpg',
    'Cathy': '/mentors/cathy.jpeg',
    '봉이 김선달': '/mentors/bongi-kimsundal.png',
    '신사임당': '/mentors/shin-saimdang.png',
    '갓출리더의 홧병상담소': '/mentors/god-leader.png',
}

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
    logId?: string | null
}

export default function MentorMatchHero() {
    const [concern, setConcern] = useState('')
    const [isMatching, setIsMatching] = useState(false)
    const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
    const [showLoginPrompt, setShowLoginPrompt] = useState(false)
    const [placeholderIdx, setPlaceholderIdx] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const router = useRouter()

    const rotatePlaceholder = useCallback(() => {
        setPlaceholderIdx(prev => (prev + 1) % PLACEHOLDER_CONCERNS.length)
    }, [])

    /** 멘토 이미지 가져오기 (avatar_url → MENTOR_IMAGES 폴백) */
    const getMentorImage = (mentor: MatchResult['mentor']): string | null => {
        return mentor.avatar_url || MENTOR_IMAGES[mentor.name] || null
    }

    const handleMatch = async () => {
        const text = concern.trim()
        if (!text || text.length < 2 || isMatching) return

        setIsMatching(true)
        setMatchResult(null)
        setShowLoginPrompt(false)

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

    const startChat = async () => {
        if (!matchResult) return

        // 클릭 추적
        if (matchResult.logId) {
            try {
                fetch('/api/mentor-match/click', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ logId: matchResult.logId }),
                })
            } catch { /* 무시 */ }
        }

        // 로그인 여부 확인
        try {
            const authRes = await fetch('/api/auth/me')
            const authData = await authRes.json()

            if (!authData?.user) {
                // 비회원: 로그인 유도
                setShowLoginPrompt(true)
                return
            }

            // 회원: 고민 저장 후 채팅으로 이동
            try {
                await fetch('/api/user-concerns', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        concern: concern.trim(),
                        matchedMentorId: matchResult.mentor.id,
                        matchedMentorName: matchResult.mentor.name,
                    }),
                })
            } catch { /* 저장 실패해도 진행 */ }
        } catch { /* auth 확인 실패해도 진행 */ }

        const encoded = encodeURIComponent(concern.trim())
        router.push(`/chat/${matchResult.mentor.id}?auto_msg=${encoded}`)
    }

    return (
        <div style={{
            maxWidth: 1000, margin: '0 auto',
            padding: '40px 40px 16px',
            minHeight: 200,
        }}>
            <div style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #312e81 100%)',
                borderRadius: 28,
                padding: '44px 36px 40px',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: '0 20px 60px rgba(15,23,42,0.3)',
            }}>
                {/* 배경 데코 */}
                <div style={{
                    position: 'absolute', top: -60, right: -60,
                    width: 240, height: 240, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)',
                }} />
                <div style={{
                    position: 'absolute', bottom: -40, left: -20,
                    width: 160, height: 160, borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)',
                }} />
                <div style={{
                    position: 'absolute', top: 20, left: '30%',
                    width: 4, height: 4, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.3)',
                    boxShadow: '40px 30px 0 rgba(255,255,255,0.15), 120px -10px 0 rgba(255,255,255,0.1), 200px 20px 0 rgba(255,255,255,0.2), -60px 40px 0 rgba(255,255,255,0.12)',
                }} />

                {/* 타이틀 */}
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        background: 'rgba(99,102,241,0.2)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        borderRadius: 20, padding: '5px 14px',
                        fontSize: 12, fontWeight: 600, color: '#a5b4fc',
                        marginBottom: 14, letterSpacing: '0.02em',
                    }}>
                        ✨ AI 매칭
                    </div>
                    <h2 style={{
                        fontSize: 26, fontWeight: 800, color: '#fff',
                        margin: '0 0 8px', lineHeight: 1.35,
                        letterSpacing: '-0.03em',
                    }}>
                        고민 한 줄이면, 딱 맞는 AI를 찾아드려요
                    </h2>
                    <p style={{
                        fontSize: 14, color: 'rgba(203,213,225,0.8)', margin: '0 0 24px',
                        lineHeight: 1.5,
                    }}>
                        어떤 고민이든 적어보세요. 3초 안에 맞춤 AI를 매칭해드릴게요.
                    </p>
                </div>

                {/* 입력 영역 */}
                {!matchResult && !showLoginPrompt && (
                    <div style={{
                        position: 'relative', zIndex: 1,
                        animation: 'heroSlideUp 0.4s ease',
                    }}>
                        <div style={{
                            display: 'flex', gap: 0,
                            background: 'rgba(255,255,255,0.07)',
                            border: '1.5px solid rgba(255,255,255,0.15)',
                            borderRadius: 18,
                            padding: 5,
                            backdropFilter: 'blur(12px)',
                            transition: 'border-color 0.3s, box-shadow 0.3s',
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
                                    padding: '15px 20px',
                                    borderRadius: 14,
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: 15,
                                    color: '#fff',
                                    outline: 'none',
                                    caretColor: '#818cf8',
                                }}
                            />
                            <button
                                onClick={handleMatch}
                                disabled={!concern.trim() || isMatching}
                                style={{
                                    padding: '13px 26px',
                                    borderRadius: 14,
                                    border: 'none',
                                    background: (!concern.trim() || isMatching)
                                        ? 'rgba(255,255,255,0.08)'
                                        : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    color: (!concern.trim() || isMatching) ? 'rgba(255,255,255,0.3)' : '#fff',
                                    fontSize: 15,
                                    fontWeight: 700,
                                    cursor: concern.trim() && !isMatching ? 'pointer' : 'not-allowed',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.3s',
                                    boxShadow: concern.trim() && !isMatching
                                        ? '0 4px 20px rgba(99,102,241,0.4)' : 'none',
                                    letterSpacing: '0.01em',
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
                                        매칭 중
                                    </span>
                                ) : 'AI 찾기 →'}
                            </button>
                        </div>
                        {/* 빠른 태그 */}
                        <div style={{
                            display: 'flex', gap: 8, marginTop: 14,
                            flexWrap: 'wrap',
                        }}>
                            {['💰 수익화', '📝 콘텐츠', '🧠 자기계발', '💼 창업'].map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => {
                                        const text = tag.slice(3)
                                        setConcern(text)
                                        setTimeout(() => inputRef.current?.focus(), 50)
                                    }}
                                    style={{
                                        padding: '7px 14px',
                                        borderRadius: 10,
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'rgba(255,255,255,0.05)',
                                        color: 'rgba(255,255,255,0.6)',
                                        fontSize: 13,
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 비회원 로그인 유도 */}
                {showLoginPrompt && matchResult && (
                    <div style={{
                        animation: 'heroSlideUp 0.4s ease',
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: 20,
                        padding: '28px 24px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        backdropFilter: 'blur(12px)',
                        textAlign: 'center',
                        position: 'relative', zIndex: 1,
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
                            <div style={{
                                width: 52, height: 52, borderRadius: 16,
                                overflow: 'hidden', flexShrink: 0,
                                border: '2px solid rgba(99,102,241,0.3)',
                            }}>
                                {getMentorImage(matchResult.mentor) ? (
                                    <Image
                                        src={getMentorImage(matchResult.mentor)!}
                                        alt={matchResult.mentor.name}
                                        width={52} height={52}
                                        style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                                    />
                                ) : (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(99,102,241,0.2)', fontSize: 24 }}>🤖</div>
                                )}
                            </div>
                            <div style={{ textAlign: 'left' }}>
                                <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{matchResult.mentor.name}</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>님이 기다리고 있어요!</div>
                            </div>
                        </div>

                        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', marginBottom: 20, lineHeight: 1.6 }}>
                            무료 회원가입하면<br />
                            <strong style={{ color: '#a5b4fc' }}>{matchResult.mentor.name}</strong>과 바로 대화를 시작할 수 있어요 ✨
                        </p>

                        <button
                            onClick={() => {
                                localStorage.setItem('pending_concern', JSON.stringify({
                                    concern: concern.trim(),
                                    mentorId: matchResult.mentor.id,
                                }))
                                router.push('/login')
                            }}
                            style={{
                                width: '100%', padding: '14px 20px', borderRadius: 14,
                                border: 'none',
                                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                color: '#fff', fontSize: 16, fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
                                marginBottom: 10,
                            }}
                        >
                            🚀 무료 회원가입하고 대화 시작
                        </button>
                        <button
                            onClick={() => {
                                setShowLoginPrompt(false)
                                const encoded = encodeURIComponent(concern.trim())
                                router.push(`/chat/${matchResult.mentor.id}?auto_msg=${encoded}`)
                            }}
                            style={{
                                width: '100%', padding: '12px 20px', borderRadius: 14,
                                border: 'none', background: 'transparent',
                                color: 'rgba(255,255,255,0.4)', fontSize: 13, cursor: 'pointer',
                            }}
                        >
                            일단 비회원으로 대화해볼게요
                        </button>
                    </div>
                )}

                {/* 매칭 결과 */}
                {matchResult && !showLoginPrompt && (
                    <div style={{
                        animation: 'heroSlideUp 0.4s ease',
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: 20,
                        padding: '24px',
                        border: '1px solid rgba(99,102,241,0.25)',
                        backdropFilter: 'blur(12px)',
                        position: 'relative', zIndex: 1,
                    }}>
                        <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            background: 'rgba(99,102,241,0.15)',
                            border: '1px solid rgba(99,102,241,0.3)',
                            borderRadius: 20, padding: '4px 14px',
                            fontSize: 12, fontWeight: 700, color: '#a5b4fc',
                            marginBottom: 16,
                        }}>
                            ✨ AI 매칭 완료 — {matchResult.reason}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: 18,
                                overflow: 'hidden', flexShrink: 0,
                                border: '2px solid rgba(99,102,241,0.3)',
                                background: 'rgba(99,102,241,0.1)',
                            }}>
                                {getMentorImage(matchResult.mentor) ? (
                                    <Image
                                        src={getMentorImage(matchResult.mentor)!}
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
                                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>
                                    {matchResult.mentor.name}
                                </div>
                                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                                    {matchResult.mentor.title}
                                </div>
                            </div>
                        </div>

                        {matchResult.firstMessage && (
                            <div style={{
                                background: 'rgba(255,255,255,0.05)',
                                borderRadius: 14,
                                padding: '14px 18px',
                                fontSize: 14,
                                color: 'rgba(255,255,255,0.7)',
                                lineHeight: 1.6,
                                marginBottom: 16,
                                borderLeft: '3px solid #6366f1',
                            }}>
                                💬 &ldquo;{matchResult.firstMessage}&rdquo;
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={startChat}
                                style={{
                                    flex: 1, padding: '14px 20px', borderRadius: 14,
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    color: '#fff', fontSize: 16, fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
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
                                    padding: '14px 18px', borderRadius: 14,
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    background: 'rgba(255,255,255,0.05)',
                                    color: 'rgba(255,255,255,0.6)',
                                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
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
                @keyframes heroSlideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
                input::placeholder { color: rgba(255,255,255,0.3) !important; }
            `}</style>
        </div>
    )
}

