'use client'

import { useRouter } from 'next/navigation'

interface MentorHeaderProps {
    mentor: {
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
}

export default function MentorHeader({
    mentor,
    mentorImage,
    mentorEmoji,
    isStreaming,
    onNewChat,
    onCall,
}: MentorHeaderProps) {
    const router = useRouter()

    return (
        <header className="chat-header" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 24px',
            borderBottom: '1px solid #eee',
            background: '#fff',
            position: 'sticky',
            top: 0,
            zIndex: 10,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                    onClick={() => router.push('/mentors')}
                    style={{
                        background: 'none',
                        border: 'none',
                        fontSize: 20,
                        cursor: 'pointer',
                        padding: '4px 8px',
                        color: '#18181b',
                    }}
                >
                    ←
                </button>
                {mentorImage ? (
                    <img
                        src={mentorImage}
                        alt={mentor.name}
                        className="chat-header-avatar"
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            objectFit: 'cover',
                        }}
                    />
                ) : (
                    <div className="chat-header-avatar-emoji" style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                    }}>
                        {mentorEmoji}
                    </div>
                )}
                <div>
                    <div className="chat-header-name" style={{
                        fontWeight: 700,
                        fontSize: 18,
                        color: '#18181b',
                        lineHeight: 1.3,
                    }}>
                        {mentor.name}
                    </div>
                    <div className="chat-header-title" style={{
                        fontSize: 14,
                        color: '#a1a1aa',
                        lineHeight: 1.3,
                    }}>
                        {mentor.title}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isStreaming && (
                    <div style={{
                        fontSize: 15,
                        color: '#22c55e',
                        fontWeight: 500,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}>
                        <span style={{
                            display: 'inline-block',
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: '#22c55e',
                            animation: 'pulseSoft 1.5s ease-in-out infinite',
                        }} />
                        답변 중
                    </div>
                )}

                {/* 📞 전화 버튼 — onCall이 있을 때만 표시 */}
                {onCall && (
                    <button
                        onClick={onCall}
                        aria-label="음성 대화 시작"
                        title="음성 대화"
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            color: '#22c55e',
                            fontSize: 17,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'transform 0.15s, background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.08)'
                            e.currentTarget.style.background = '#dcfce7'
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)'
                            e.currentTarget.style.background = '#f0fdf4'
                        }}
                    >
                        📞
                    </button>
                )}

                <button
                    onClick={onNewChat}
                    className="chat-new-btn"
                    style={{
                        background: 'none',
                        border: '1px solid #e4e4e7',
                        borderRadius: 8,
                        padding: '6px 14px',
                        fontSize: 15,
                        color: '#52525b',
                        cursor: 'pointer',
                        fontWeight: 500,
                    }}
                >
                    + 새 대화
                </button>
            </div>
        </header>
    )
}
