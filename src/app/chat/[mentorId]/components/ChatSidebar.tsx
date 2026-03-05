'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface SidebarSession {
    id: string
    title: string
    last_message_at: string
    message_count: number
    is_pinned: boolean
    mentors?: { name: string; slug: string } | null
}

interface ChatSidebarProps {
    sessions: SidebarSession[]
    currentSessionId: string | null
    mentorName: string
    isOpen: boolean
    onClose: () => void
    onSelectSession: (sessionId: string) => void
    onNewChat: () => void
    onUpdateSession: (sessionId: string, updates: { title?: string; is_pinned?: boolean }) => void
}

/* ── SVG 아이콘 ── */
const PinIcon = ({ filled }: { filled: boolean }) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 1L9 1L9.5 5L11 6.5V7.5H7.5L7 13L6.5 13L6 7.5H3V6.5L4.5 5L5 1Z" />
    </svg>
)
const EditIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2L12 4L5 11H3V9L10 2Z" />
    </svg>
)
const MoreIcon = () => (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="4" r="1.2" />
        <circle cx="8" cy="8" r="1.2" />
        <circle cx="8" cy="12" r="1.2" />
    </svg>
)
const PlusIcon = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="9" y1="3" x2="9" y2="15" />
        <line x1="3" y1="9" x2="15" y2="9" />
    </svg>
)
const CloseIcon = () => (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="4" y1="4" x2="14" y2="14" />
        <line x1="14" y1="4" x2="4" y2="14" />
    </svg>
)
const CheckSmallIcon = () => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 7L5.5 10.5L12 3.5" />
    </svg>
)

function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMin < 1) return '방금'
    if (diffMin < 60) return `${diffMin}분 전`
    if (diffHours < 24) return `${diffHours}시간 전`
    if (diffDays < 7) return `${diffDays}일 전`
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

/** 대화 제목에서 요약 문장 추출 */
function getSessionSummary(session: SidebarSession): string {
    if (session.title && !session.title.endsWith('와의 대화') && session.title !== '새 대화') {
        return session.title
    }
    return '새 대화'
}

/** 세션 항목 — 컨텍스트 메뉴 (고정/이름변경) */
function SessionItem({
    session,
    isActive,
    onSelect,
    onUpdate,
}: {
    session: SidebarSession
    isActive: boolean
    onSelect: () => void
    onUpdate: (updates: { title?: string; is_pinned?: boolean }) => void
}) {
    const [menuOpen, setMenuOpen] = useState(false)
    const [isEditing, setIsEditing] = useState(false)
    const [editValue, setEditValue] = useState(session.title || '')
    const menuRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (!menuOpen) return
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [menuOpen])

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditing])

    const handleRename = useCallback(() => {
        const trimmed = editValue.trim()
        if (trimmed && trimmed !== session.title) {
            onUpdate({ title: trimmed })
        }
        setIsEditing(false)
    }, [editValue, session.title, onUpdate])

    const displayTitle = getSessionSummary(session)

    return (
        <div
            className="session-item"
            style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 16px',
                borderRadius: 14,
                cursor: 'pointer',
                background: isActive ? '#f0fdf4' : 'transparent',
                transition: 'all 0.15s ease',
                borderLeft: isActive ? '3px solid #22c55e' : '3px solid transparent',
                marginBottom: 2,
            }}
            onClick={isEditing ? undefined : onSelect}
            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
        >
            {/* 고정 아이콘 */}
            {session.is_pinned && (
                <span style={{ color: '#22c55e', flexShrink: 0, display: 'flex' }}>
                    <PinIcon filled />
                </span>
            )}

            {/* 제목 / 편집 */}
            <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                    <input
                        ref={inputRef}
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={handleRename}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleRename()
                            if (e.key === 'Escape') setIsEditing(false)
                        }}
                        style={{
                            width: '100%',
                            border: '1px solid #22c55e',
                            borderRadius: 8,
                            padding: '4px 8px',
                            fontSize: 14,
                            outline: 'none',
                            fontFamily: 'inherit',
                        }}
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <>
                        <div style={{
                            fontSize: 14,
                            fontWeight: isActive ? 600 : 500,
                            color: isActive ? '#15803d' : '#374151',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.4,
                        }}>
                            {displayTitle}
                        </div>
                        <div style={{
                            fontSize: 12,
                            color: '#94a3b8',
                            marginTop: 3,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                        }}>
                            <span>{formatRelativeTime(session.last_message_at || session.id)}</span>
                            {session.message_count > 0 && (
                                <span style={{ opacity: 0.7 }}>· 대화 {session.message_count}번</span>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* ⋮ 메뉴 버튼 */}
            {!isEditing && (
                <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
                    <button
                        onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: 4, borderRadius: 6,
                            color: '#94a3b8',
                            display: 'flex', alignItems: 'center',
                            opacity: 0,
                            transition: 'opacity 0.15s',
                        }}
                        className="session-menu-btn"
                    >
                        <MoreIcon />
                    </button>

                    {/* 드롭다운 메뉴 */}
                    {menuOpen && (
                        <div style={{
                            position: 'absolute',
                            right: 0, top: '100%',
                            background: '#fff',
                            borderRadius: 10,
                            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                            border: '1px solid #f1f5f9',
                            zIndex: 100,
                            minWidth: 140,
                            overflow: 'hidden',
                            animation: 'menuFadeIn 0.15s ease',
                        }}>
                            <button
                                onClick={e => {
                                    e.stopPropagation()
                                    onUpdate({ is_pinned: !session.is_pinned })
                                    setMenuOpen(false)
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    width: '100%', padding: '10px 14px',
                                    background: 'none', border: 'none',
                                    fontSize: 14, color: '#374151',
                                    cursor: 'pointer', textAlign: 'left',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                            >
                                <PinIcon filled={session.is_pinned} />
                                {session.is_pinned ? '고정 해제' : '고정'}
                            </button>
                            <button
                                onClick={e => {
                                    e.stopPropagation()
                                    setEditValue(displayTitle)
                                    setIsEditing(true)
                                    setMenuOpen(false)
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    width: '100%', padding: '10px 14px',
                                    background: 'none', border: 'none',
                                    fontSize: 14, color: '#374151',
                                    cursor: 'pointer', textAlign: 'left',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                            >
                                <EditIcon />
                                이름 변경
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default function ChatSidebar({
    sessions,
    currentSessionId,
    mentorName,
    isOpen,
    onClose,
    onSelectSession,
    onNewChat,
    onUpdateSession,
}: ChatSidebarProps) {
    const pinned = sessions.filter(s => s.is_pinned)
    const unpinned = sessions.filter(s => !s.is_pinned)

    const sidebarContent = (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: '#fff',
            borderRight: '1px solid #f1f5f9',
        }}>
            {/* 헤더 */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '18px 18px 14px',
                borderBottom: '1px solid #f1f5f9',
            }}>
                <h3 style={{
                    margin: 0,
                    fontSize: 17,
                    fontWeight: 700,
                    color: '#1e293b',
                    letterSpacing: '-0.01em',
                }}>
                    대화
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                        onClick={onNewChat}
                        title="새 대화"
                        style={{
                            width: 36, height: 36,
                            borderRadius: 10,
                            background: '#f0fdf4', border: 'none',
                            color: '#22c55e', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#dcfce7' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#f0fdf4' }}
                    >
                        <PlusIcon />
                    </button>
                    {/* 모바일 오버레이에서만 X 닫기 버튼 */}
                    <button
                        onClick={onClose}
                        className="sidebar-mobile-close"
                        title="닫기"
                        style={{
                            width: 36, height: 36,
                            borderRadius: 10,
                            background: 'none', border: 'none',
                            color: '#94a3b8', cursor: 'pointer',
                            display: 'none',
                            alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        <CloseIcon />
                    </button>
                </div>
            </div>

            {/* 세션 목록 */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '8px 14px',
            }}>
                {sessions.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '48px 16px',
                        color: '#94a3b8',
                        fontSize: 14,
                    }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>💬</div>
                        아직 대화가 없어요
                    </div>
                ) : (
                    <>
                        {/* 고정된 세션 */}
                        {pinned.length > 0 && (
                            <>
                                <div style={{
                                    fontSize: 11, fontWeight: 600,
                                    color: '#94a3b8', textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    padding: '10px 14px 4px',
                                }}>
                                    📌 고정
                                </div>
                                {pinned.map(s => (
                                    <SessionItem
                                        key={s.id}
                                        session={s}
                                        isActive={s.id === currentSessionId}
                                        onSelect={() => onSelectSession(s.id)}
                                        onUpdate={(updates) => onUpdateSession(s.id, updates)}
                                    />
                                ))}
                            </>
                        )}

                        {/* 나머지 세션 */}
                        {unpinned.length > 0 && (
                            <>
                                {pinned.length > 0 && (
                                    <div style={{
                                        fontSize: 11, fontWeight: 600,
                                        color: '#94a3b8', textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        padding: '14px 14px 4px',
                                    }}>
                                        최근
                                    </div>
                                )}
                                {unpinned.map(s => (
                                    <SessionItem
                                        key={s.id}
                                        session={s}
                                        isActive={s.id === currentSessionId}
                                        onSelect={() => onSelectSession(s.id)}
                                        onUpdate={(updates) => onUpdateSession(s.id, updates)}
                                    />
                                ))}
                            </>
                        )}
                    </>
                )}
            </div>

            {/* 하단 멘토 정보 + AI 뱃지 */}
            <div style={{
                padding: '14px 18px',
                borderTop: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
            }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>
                    {mentorName}
                </span>
                <span style={{
                    fontSize: 11, fontWeight: 700,
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: 6,
                    letterSpacing: '0.03em',
                }}>AI</span>
            </div>
        </div>
    )

    return (
        <>
            {/* 모든 화면: 오버레이 사이드바 (Gemini 스타일) */}
            {isOpen && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 200,
                    }}
                >
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(0,0,0,0.25)',
                            backdropFilter: 'blur(2px)',
                        }}
                        onClick={onClose}
                    />
                    <div style={{
                        position: 'absolute',
                        left: 0, top: 0, bottom: 0,
                        width: 'min(320px, 85vw)',
                        animation: 'sidebarSlideIn 0.2s ease',
                        boxShadow: '4px 0 24px rgba(0,0,0,0.1)',
                    }}>
                        {sidebarContent}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes sidebarSlideIn {
                    from { transform: translateX(-100%); }
                    to { transform: translateX(0); }
                }
                @keyframes menuFadeIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .session-item:hover .session-menu-btn { opacity: 1 !important; }
            `}</style>
        </>
    )
}
