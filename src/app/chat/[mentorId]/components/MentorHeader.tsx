'use client'

/**
 * 대화 화면 맨 위 띠 — 지금 누구와 말하고 있는지만 보여준다
 *
 * 대표 지시 2026-09-14 = 「대화창 UI는 더 직관적이고 깔끔하게 해. 지금 채팅 UI 다 걷어내고」
 * 「대화 창에도 더 이미지 크게 해. 이 사람이랑 대화하는 느낌을 주란말이야. web/MO 둘 다」
 *
 * 전에는 이 한 줄에 통화·전자책·보고서·공유·사이드바 여닫기까지 일곱 가지가 붙어 있었다.
 * 남긴 것은 셋이다. 뒤로 가기 · 상대 얼굴과 이름 · 새 대화.
 */
import Image from 'next/image'
import Link from 'next/link'

interface Props {
    mentor: { id: string; name: string; title?: string }
    mentorImage?: string | null
    mentorEmoji?: string
    isStreaming?: boolean
    onNewChat?: () => void
    // 아래는 예전 화면이 넘기던 것들. 지금 띠에서는 쓰지 않는다.
    onCall?: () => void
    onToggleSidebar?: () => void
    isSidebarOpen?: boolean
    sessionId?: string | null
    aiContentLength?: number
    isReportNew?: boolean
    pdfExportEnabled?: boolean
    exportLabel?: string
    onEditRequest?: (prefill: string) => void
}

export default function MentorHeader({ mentor, mentorImage, mentorEmoji, isStreaming, onNewChat }: Props) {
    return (
        <header
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 30,
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'saturate(180%) blur(12px)',
                borderBottom: '1px solid var(--선)',
            }}
        >
            <div
                style={{
                    maxWidth: 960,   // 대화 칸과 맞춘다 — 대표 지적 2026-09-15
                    margin: '0 auto',
                    height: 68,
                    padding: '0 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                }}
            >
                <Link
                    href={`/coach/${mentor.id}`}
                    aria-label="코치 소개로 돌아가기"
                    style={{
                        width: 38, height: 38, flexShrink: 0,
                        display: 'grid', placeItems: 'center',
                        borderRadius: 999, color: 'var(--먹연)',
                        fontSize: 22, textDecoration: 'none',
                    }}
                >
                    ‹
                </Link>

                <Link
                    href={`/coach/${mentor.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1, textDecoration: 'none', color: 'inherit' }}
                >
                    <span
                        style={{
                            position: 'relative',
                            width: 'clamp(48px, 3.6vw, 58px)', height: 'clamp(48px, 3.6vw, 58px)', flexShrink: 0,
                            borderRadius: 999, overflow: 'hidden',
                            background: '#E8F2EC',
                            display: 'grid', placeItems: 'center',
                            fontSize: 22,
                        }}
                    >
                        {mentorImage ? (
                            <Image src={mentorImage} alt="" fill sizes="48px" quality={90} style={{ objectFit: 'cover', objectPosition: 'center 20%' }} />
                        ) : (
                            <span aria-hidden>{mentorEmoji || mentor.name.slice(0, 1)}</span>
                        )}
                    </span>

                    <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 'clamp(17px, 1.45vw, 20px)', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--먹)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {mentor.name}
                        </span>
                        <span style={{ display: 'block', fontSize: 'clamp(13px, 1.15vw, 15.5px)', color: isStreaming ? 'var(--연두)' : 'var(--먹연)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isStreaming ? '쓰는 중…' : (mentor.title || '')}
                        </span>
                    </span>
                </Link>

                {onNewChat && (
                    <button
                        type="button"
                        onClick={onNewChat}
                        style={{
                            flexShrink: 0,
                            height: 38,
                            padding: '0 14px',
                            borderRadius: 999,
                            border: '1px solid var(--선)',
                            background: '#fff',
                            fontSize: 'clamp(14px, 1.2vw, 16px)',
                            fontWeight: 700,
                            color: 'var(--먹)',
                            cursor: 'pointer',
                        }}
                    >
                        새 대화
                    </button>
                )}
            </div>
        </header>
    )
}
