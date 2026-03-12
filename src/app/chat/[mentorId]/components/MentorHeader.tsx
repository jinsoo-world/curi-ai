'use client'

import { useRouter } from 'next/navigation'

interface MentorHeaderProps {
    mentor: {
        id: string
        name: string
        slug: string
        title: string
        avatar_url: string | null
        sample_questions: string[]
    }
    mentorImage: string | undefined
    mentorEmoji: string
    isStreaming: boolean
    onNewChat: () => void
    /** 전화 버튼 클릭 시 콜백 (없으면 전화 버튼 숨김) */
    onCall?: () => void
    /** 사이드바 토글 (모바일) */
    onToggleSidebar?: () => void
}

/* ── SVG 아이콘 ── */
const BackIcon = () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 4L7 10L13 16" />
    </svg>
)
const PhoneIcon = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3.5C2 2.67 2.67 2 3.5 2H6.12a1 1 0 01.98.76l.68 3.03a1 1 0 01-.29.93L5.78 8.44a11.05 11.05 0 005.78 5.78l1.72-1.71a1 1 0 01.93-.29l3.03.68a1 1 0 01.76.98V16.5a1.5 1.5 0 01-1.5 1.5A14.5 14.5 0 012 3.5z" />
    </svg>
)
const PlusIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="8" y1="3" x2="8" y2="13" />
        <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
)
const ShareIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8V13H12V8" />
        <polyline points="8,2 8,10" />
        <polyline points="5.5,4.5 8,2 10.5,4.5" />
    </svg>
)

export default function MentorHeader({
    mentor,
    mentorImage,
    mentorEmoji,
    isStreaming,
    onNewChat,
    onCall,
    onToggleSidebar,
}: MentorHeaderProps) {
    const router = useRouter()

    return (
        <header style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 16px 10px 12px',
            borderBottom: '1px solid #f1f5f9',
            background: '#fff',
            position: 'sticky',
            top: 0,
            zIndex: 10,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* 모바일 사이드바 토글 */}
                {onToggleSidebar && (
                    <button
                        onClick={onToggleSidebar}
                        className="sidebar-toggle-btn"
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 8,
                            borderRadius: 10,
                            color: '#64748b',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                    >
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="3" y1="5" x2="17" y2="5" />
                            <line x1="3" y1="10" x2="17" y2="10" />
                            <line x1="3" y1="15" x2="17" y2="15" />
                        </svg>
                    </button>
                )}
                <button
                    onClick={() => {
                        // 히스토리가 있으면 뒤로, 없으면 멘토 목록으로
                        if (window.history.length > 1) {
                            router.back()
                        } else {
                            router.push('/mentors')
                        }
                    }}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 8,
                        borderRadius: 10,
                        color: '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                >
                    <BackIcon />
                </button>

                {mentorImage ? (
                    <img
                        src={mentorImage}
                        alt={mentor.name}
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            objectFit: 'cover',
                        }}
                    />
                ) : (
                    <img
                        src="/logo.png"
                        alt="큐리 AI"
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            objectFit: 'cover',
                        }}
                    />
                )}

                <div>
                    <div style={{
                        fontWeight: 700,
                        fontSize: 16,
                        color: '#1e293b',
                        lineHeight: 1.3,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}>
                        {mentor.name}
                        <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            color: '#fff',
                            padding: '2px 7px',
                            borderRadius: 5,
                            letterSpacing: '0.03em',
                            lineHeight: 1.4,
                        }}>AI</span>
                    </div>
                    <div style={{
                        fontSize: 13,
                        color: '#94a3b8',
                        lineHeight: 1.3,
                    }}>
                        {mentor.title}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isStreaming && (
                    <div style={{
                        fontSize: 13,
                        color: '#22c55e',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        marginRight: 4,
                    }}>
                        <span style={{
                            display: 'inline-block',
                            width: 6, height: 6, borderRadius: '50%',
                            background: '#22c55e',
                            animation: 'pulseSoft 1.5s ease-in-out infinite',
                        }} />
                        답변 중
                    </div>
                )}

                {onCall && (
                    <button
                        onClick={onCall}
                        aria-label="음성 대화 시작"
                        title="음성 대화"
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: 'transparent',
                            border: 'none',
                            color: '#22c55e',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f0fdf4' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                        <PhoneIcon />
                    </button>
                )}

                <button
                    onClick={onNewChat}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 10,
                        padding: '7px 12px',
                        fontSize: 14,
                        color: '#64748b',
                        cursor: 'pointer',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                    <PlusIcon />
                    새 대화
                </button>

                {/* Share */}
                <button
                    onClick={async () => {
                        const url = `${window.location.origin}/chat/${mentor.id}`
                        const shareData = {
                            title: `${mentor.name} AI ㅣ ${mentor.title}`,
                            text: '궁금한 것을 언제든 물어보세요.',
                            url,
                        }
                        try {
                            if (navigator.share) {
                                await navigator.share(shareData)
                            } else {
                                await navigator.clipboard.writeText(url)
                                alert('링크가 복사되었습니다!')
                            }
                        } catch {}
                    }}
                    aria-label="공유하기"
                    title="공유하기"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 10,
                        padding: '7px 10px',
                        fontSize: 14,
                        color: '#64748b',
                        cursor: 'pointer',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                    <ShareIcon />
                </button>
            </div>
        </header>
    )
}
