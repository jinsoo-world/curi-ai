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
    // 대표 지시 2026-09-16 = 「코치 사진 더 키우고, 클릭하면 사진 크게 볼 수 있게 해.
    //                        말할 때는 살짝 떨리게 해서 말하는 것처럼 효과 주고」
    const [사진크게, set사진크게] = useState(false)
    const [붙었나, set붙었나] = useState(false)
    useEffect(() => { set붙었나(true) }, [])

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
                {/* 대표 지적 2026-09-16 = 「뒤로가기가 너무 아이콘이 작아. 확실하게 뒤로가기임을 알 수 있게 해」
                    홑화살괄호 하나(‹)로는 무엇인지 알기 어려웠다. 화살표를 그리고 「뒤로」라고 적는다. */}
                <Link
                    href="/chats"
                    aria-label="채팅 목록으로 돌아가기"
                    style={{
                        height: 40, flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '0 15px 0 11px',
                        borderRadius: 999,
                        border: '1px solid var(--선)',
                        background: '#fff',
                        color: 'var(--먹)',
                        fontSize: 15, fontWeight: 800, letterSpacing: '-0.03em',
                        textDecoration: 'none',
                    }}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M15 5l-7 7 7 7" />
                    </svg>
                    뒤로
                </Link>

                <button
                    type="button"
                    onClick={() => mentorImage && set사진크게(true)}
                    aria-label={`${mentor.name} 사진 크게 보기`}
                    className={isStreaming ? 'coach-face talking' : 'coach-face'}
                    style={{
                        position: 'relative',
                        width: 'clamp(58px, 4.6vw, 76px)', height: 'clamp(58px, 4.6vw, 76px)', flexShrink: 0,
                        borderRadius: 999, overflow: 'hidden',
                        background: '#E8F2EC',
                        display: 'grid', placeItems: 'center',
                        fontSize: 26, border: 0, padding: 0,
                        cursor: mentorImage ? 'zoom-in' : 'default',
                    }}
                >
                    {mentorImage ? (
                        <Image src={mentorImage} alt="" fill sizes="76px" quality={90} style={{ objectFit: 'cover', objectPosition: 'center 20%' }} />
                    ) : (
                        <span aria-hidden>{mentorEmoji || mentor.name.slice(0, 1)}</span>
                    )}
                </button>

                <Link
                    href={`/coach/${mentor.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1, textDecoration: 'none', color: 'inherit' }}
                >
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
