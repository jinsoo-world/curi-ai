'use client'

/**
 * 대화 화면 맨 위 띠 — Delphi 스타일 깔끔한 헤더 (2026-09-22)
 *
 * CEO 지시: "채팅 UI도 델파이처럼" - 큰 아바타, 넉넉한 간격, 부드러운 라운딩
 */
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

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
    // Delphi 스타일: 큰 아바타, 부드러운 인터랙션
    const [사진크게, set사진크게] = useState(false)
    const [붙었나, set붙었나] = useState(false)
    useEffect(() => { set붙었나(true) }, [])

    return (
        <header
            style={{
                position: 'sticky',
                top: 0,
                zIndex: 30,
                background: 'rgba(255,255,255,0.96)',
                backdropFilter: 'saturate(180%) blur(16px)',
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
        >
            <div
                style={{
                    maxWidth: 960,
                    margin: '0 auto',
                    height: 60,
                    padding: '0 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                }}
            >
                {/* Delphi 스타일: 부드러운 뒤로가기 버튼 */}
                <Link
                    href="/chats"
                    aria-label="채팅 목록으로 돌아가기"
                    style={{
                        height: 42, flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '0 16px 0 12px',
                        borderRadius: 12,
                        border: '1px solid rgba(0,0,0,0.08)',
                        background: '#fff',
                        color: 'var(--먹)',
                        fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em',
                        textDecoration: 'none',
                        transition: 'all 0.15s',
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M15 5l-7 7 7 7" />
                    </svg>
                    뒤로
                </Link>

                {/* Delphi 스타일: 얇은 헤더, 작은 아바타 (CEO 요구 2026-09-22) */}
                <button
                    type="button"
                    onClick={() => mentorImage && set사진크게(true)}
                    aria-label={`${mentor.name} 사진 크게 보기`}
                    className={isStreaming ? 'coach-face talking' : 'coach-face'}
                    style={{
                        position: 'relative',
                        width: 'clamp(48px, 4vw, 56px)', 
                        height: 'clamp(48px, 4vw, 56px)', 
                        flexShrink: 0,
                        borderRadius: '50%', 
                        overflow: 'hidden',
                        background: 'linear-gradient(135deg, #E8F2EC 0%, #D4E8DC 100%)',
                        display: 'grid', placeItems: 'center',
                        fontSize: 22, border: '2px solid rgba(255,255,255,0.9)', 
                        padding: 0,
                        cursor: mentorImage ? 'zoom-in' : 'default',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                        transition: 'transform 0.15s',
                    }}
                >
                    {mentorImage ? (
                        <Image src={mentorImage} alt="" fill sizes="56px" quality={90} style={{ objectFit: 'cover', objectPosition: 'center 20%' }} />
                    ) : (
                        <span aria-hidden>{mentorEmoji || mentor.name.slice(0, 1)}</span>
                    )}
                </button>

                <Link
                    href={`/coach/${mentor.id}`}
                    style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 10, 
                        minWidth: 0, 
                        flex: 1, 
                        textDecoration: 'none', 
                        color: 'inherit' 
                    }}
                >
                    <span style={{ minWidth: 0 }}>
                        <span style={{ 
                            display: 'block', 
                            fontSize: 'clamp(16px, 1.4vw, 18px)', 
                            fontWeight: 800, 
                            letterSpacing: '-0.02em', 
                            color: 'var(--먹)', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap',
                            marginBottom: 1,
                        }}>
                            {mentor.name}
                        </span>
                        <span style={{ 
                            display: 'block', 
                            fontSize: 'clamp(13px, 1.1vw, 14px)', 
                            color: isStreaming ? '#10b981' : 'var(--먹연)', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap',
                            fontWeight: 500,
                        }}>
                            {isStreaming ? '답변 중…' : (mentor.title || '')}
                        </span>
                    </span>
                </Link>

                {/* Delphi 스타일: 부드러운 새 대화 버튼 */}
                {onNewChat && (
                    <button
                        type="button"
                        onClick={onNewChat}
                        style={{
                            flexShrink: 0,
                            height: 38,
                            padding: '0 16px',
                            borderRadius: 10,
                            border: '1px solid rgba(0,0,0,0.08)',
                            background: '#fff',
                            fontSize: 'clamp(13px, 1.1vw, 14px)',
                            fontWeight: 700,
                            color: 'var(--먹)',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}
                    >
                        새 대화
                    </button>
                )}
            </div>

            {/* 사진 크게 보기 — 띠(header) 밖에 그린다.
                띠에 걸린 흐림 효과가 자기 안의 fixed 를 띠 높이 안에 가두기 때문이다(2026-09-16 실측). */}
            {붙었나 && 사진크게 && mentorImage && createPortal((
                <div
                    role="dialog"
                    aria-label={`${mentor.name} 사진`}
                    onClick={() => set사진크게(false)}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 200,
                        background: 'rgba(17,24,19,0.86)',
                        display: 'grid', placeItems: 'center',
                        padding: 24, cursor: 'zoom-out',
                    }}
                >
                    {/* next/image 의 fill 은 부모 높이가 잡히지 않으면 아무것도 안 보인다(2026-09-16 실측).
                        큰 사진은 일반 img 로 확실히 띄운다. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={mentorImage}
                        alt={mentor.name}
                        style={{
                            width: 'min(86vw, 520px)',
                            maxHeight: '68vh',
                            objectFit: 'cover',
                            borderRadius: 24,
                            display: 'block',
                            background: '#E8F2EC',
                        }}
                    />
                    <p style={{ color: '#fff', fontSize: 17, fontWeight: 800, marginTop: 18 }}>{mentor.name}</p>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 6 }}>아무 데나 누르면 닫혀요</p>
                </div>
            ), document.body)}

            <style>{`
                /* 말하는 동안 아주 살짝 흔들린다. 중장년 화면이라 크게 흔들지 않는다(움직임 3px 이내) */
                .coach-face.talking { animation: coach-talk 1.1s ease-in-out infinite; }
                @keyframes coach-talk {
                    0%   { transform: translateY(0)      rotate(0deg); }
                    25%  { transform: translateY(-1.5px) rotate(-1.1deg); }
                    50%  { transform: translateY(0)      rotate(0deg); }
                    75%  { transform: translateY(1.5px)  rotate(1.1deg); }
                    100% { transform: translateY(0)      rotate(0deg); }
                }
                @media (prefers-reduced-motion: reduce) {
                    .coach-face.talking { animation: none; }
                }
            `}</style>
        </header>
    )
}
