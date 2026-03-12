'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import AppSidebar from '@/components/AppSidebar'
import { MENTOR_IMAGES } from '@/domains/mentor'

interface MentorItem {
    id: string
    name: string
    title: string
    mentor_type: string
    status: string
    is_active: boolean
    created_at: string
    avatar_url: string | null
}

interface Stats {
    total: number
    active: number
    totalMessages: number
    totalUsers: number
}

interface MentorUserStat {
    userId: string
    displayName: string
    messageCount: number
}

interface MentorStatItem {
    messages: number
    users: number
    userList: MentorUserStat[]
}

export default function CreatorManagePage() {
    const router = useRouter()
    const [mentors, setMentors] = useState<MentorItem[]>([])
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState<Stats>({ total: 0, active: 0, totalMessages: 0, totalUsers: 0 })
    const [mentorStats, setMentorStats] = useState<Record<string, MentorStatItem>>({})
    const [search, setSearch] = useState('')
    const [openMenu, setOpenMenu] = useState<string | null>(null)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [expandedMentor, setExpandedMentor] = useState<string | null>(null)
    const [shareModal, setShareModal] = useState<{ id: string; name: string; title: string } | null>(null)
    const [copied, setCopied] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        fetchMentors()
    }, [])

    // 외부 클릭으로 메뉴 닫기
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setOpenMenu(null)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [])

    async function fetchMentors() {
        try {
            const res = await fetch('/api/creator/mentor/list')
            const data = await res.json()
            if (res.status === 401) {
                router.push('/login')
                return
            }
            if (res.ok) {
                setMentors(data.mentors || [])
                if (data.stats) setStats(data.stats)
                if (data.mentorStats) setMentorStats(data.mentorStats)
            }
        } catch {
            console.error('Failed to fetch mentors')
        } finally {
            setLoading(false)
        }
    }

    async function executeDelete(mentorId: string) {
        if (!confirm('정말 이 AI를 삭제하시겠습니까?')) return
        setDeleting(mentorId)
        try {
            const res = await fetch('/api/creator/mentor/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)
            setMentors(prev => prev.filter(m => m.id !== mentorId))
            setOpenMenu(null)
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.')
        } finally {
            setDeleting(null)
        }
    }

    const filteredMentors = mentors.filter(m =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.title.toLowerCase().includes(search.toLowerCase())
    )

    const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
        active: { label: 'Live', color: '#15803d', bg: '#dcfce7' },
        draft: { label: '초안', color: '#d97706', bg: '#fef3c7' },
        review: { label: '심사중', color: '#2563eb', bg: '#dbeafe' },
        inactive: { label: '배포 전', color: '#6b7280', bg: '#f3f4f6' },
    }

    const statCards = [
        { icon: '🤖', label: '내가 만든 AI', value: stats.total },
        { icon: '🌐', label: '공개된 AI', value: stats.active },
        { icon: '💬', label: '전체 메시지', value: stats.totalMessages },
        { icon: '👤', label: '대화한 사용자', value: stats.totalUsers },
    ]

    return (
        <div style={{ minHeight: '100dvh', background: '#f8f9fa' }}>
            <AppSidebar />
            <div className="sidebar-content" style={{ marginLeft: 240, minHeight: '100dvh' }}>
                <div style={{
                    maxWidth: 900,
                    margin: '0 auto',
                    padding: '28px 24px 80px',
                    fontFamily: 'var(--font-noto-sans-kr), Pretendard, sans-serif',
                }}>
                    {/* 헤더 */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                        <div>
                            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#18181b', margin: 0 }}>
                                🎨 내 AI 관리
                            </h1>
                            <p style={{ fontSize: 14, color: '#6b7280', margin: '4px 0 0' }}>
                                내가 만든 AI를 관리하세요
                            </p>
                        </div>
                        <button
                            onClick={() => router.push('/creator/create')}
                            style={{
                                padding: '10px 20px',
                                borderRadius: 10,
                                border: 'none',
                                background: '#18181b',
                                color: '#fff',
                                fontSize: 14,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                            }}
                        >
                            ＋ 새 AI 만들기
                        </button>
                    </div>

                    {/* 통계 카드 */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 14,
                        marginBottom: 24,
                    }}>
                        {statCards.map(card => (
                            <div key={card.label} style={{
                                background: '#fff',
                                borderRadius: 14,
                                padding: '20px 16px',
                                border: '1px solid #f0f0f0',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 6,
                            }}>
                                <div style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>
                                    {card.label}
                                </div>
                                <div style={{ fontSize: 28, fontWeight: 700, color: '#18181b' }}>
                                    {card.value}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 검색 */}
                    <div style={{
                        display: 'flex', gap: 10,
                        marginBottom: 16,
                    }}>
                        <div style={{
                            flex: 1,
                            position: 'relative',
                        }}>
                            <input
                                type="text"
                                placeholder="AI 이름 또는 소개로 검색..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px 10px 36px',
                                    borderRadius: 10,
                                    border: '1px solid #e5e7eb',
                                    fontSize: 14,
                                    background: '#fff',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                }}
                            />
                            <span style={{
                                position: 'absolute',
                                left: 12, top: '50%', transform: 'translateY(-50%)',
                                fontSize: 16, color: '#9ca3af', pointerEvents: 'none',
                            }}>🔍</span>
                        </div>
                    </div>

                    {/* 테이블 */}
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
                            불러오는 중...
                        </div>
                    ) : filteredMentors.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                            <div>{search ? '검색 결과가 없습니다' : '아직 만든 AI가 없습니다'}</div>
                            {!search && (
                                <button
                                    onClick={() => router.push('/creator/create')}
                                    style={{
                                        marginTop: 12,
                                        padding: '10px 20px',
                                        borderRadius: 10,
                                        border: 'none',
                                        background: '#22c55e',
                                        color: '#fff',
                                        fontSize: 14,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    첫 AI 만들기
                                </button>
                            )}
                        </div>
                    ) : (
                        <div style={{
                            background: '#fff',
                            borderRadius: 14,
                            border: '1px solid #f0f0f0',
                            overflow: 'visible',
                        }}>
                            {/* 테이블 헤더 */}
                            <div className="manage-table-header" style={{
                                display: 'grid',
                                gridTemplateColumns: '40px 1fr 120px 100px 80px',
                                padding: '12px 16px',
                                background: '#fafafa',
                                borderBottom: '1px solid #f0f0f0',
                                borderRadius: '14px 14px 0 0',
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#6b7280',
                                letterSpacing: '0.02em',
                            }}>
                                <div></div>
                                <div>AI</div>
                                <div>생성일</div>
                                <div>상태</div>
                                <div style={{ textAlign: 'center' }}>관리</div>
                            </div>

                            {/* 테이블 행 */}
                            {filteredMentors.map(m => {
                                const effectiveStatus = !m.is_active ? 'inactive' : m.status
                                const st = statusLabels[effectiveStatus] || statusLabels.draft

                                return (
                                    <React.Fragment key={m.id}>
                                    <div
                                        className="manage-table-row"
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '40px 1fr 120px 100px 80px',
                                            padding: '14px 16px',
                                            borderBottom: '1px solid #f5f5f5',
                                            alignItems: 'center',
                                            transition: 'background 100ms',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                                        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                                    >
                                        {/* 점 3개 메뉴 */}
                                        <div className="manage-col-menu" style={{ position: 'relative' }} ref={openMenu === m.id ? menuRef : null}>
                                            <button
                                                onClick={() => setOpenMenu(openMenu === m.id ? null : m.id)}
                                                style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    fontSize: 18, color: '#9ca3af', padding: '4px',
                                                    lineHeight: 1,
                                                }}
                                            >
                                                ⋮
                                            </button>
                                            {openMenu === m.id && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '100%',
                                                    left: 0,
                                                    background: '#fff',
                                                    borderRadius: 10,
                                                    boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                                                    border: '1px solid #e5e7eb',
                                                    zIndex: 100,
                                                    minWidth: 160,
                                                    padding: '6px 0',
                                                }}>
                                                    {[
                                                        { icon: '👁️', label: '미리보기', action: () => router.push(`/chat/${m.id}`) },
                                                        { icon: '✏️', label: '편집', action: () => router.push(`/creator/edit/${m.id}`) },
                                                        { icon: '📋', label: '복사', action: () => { navigator.clipboard.writeText(`${window.location.origin}/chat/${m.id}`); setOpenMenu(null) } },
                                                        { icon: '🌐', label: '배포', action: () => { window.open(`/chat/${m.id}`, '_blank'); setOpenMenu(null) } },
                                                        { icon: '🔗', label: '공유하기', action: () => { setShareModal({ id: m.id, name: m.name, title: m.title }); setOpenMenu(null) } },
                                                        { icon: '🔄', label: '소유권 이전', action: () => { alert('준비 중인 기능입니다'); setOpenMenu(null) } },
                                                        { icon: '👤', label: '사용자 초대', action: () => { navigator.clipboard.writeText(`${window.location.origin}/chat/${m.id}`); alert('링크가 복사되었습니다'); setOpenMenu(null) } },
                                                        { icon: '📊', label: '분석', action: () => { alert('준비 중인 기능입니다'); setOpenMenu(null) } },
                                                    ].map(item => (
                                                        <button
                                                            key={item.label}
                                                            onClick={item.action}
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: 10,
                                                                width: '100%',
                                                                padding: '9px 14px',
                                                                background: 'none',
                                                                border: 'none',
                                                                cursor: 'pointer',
                                                                fontSize: 13,
                                                                color: '#374151',
                                                                textAlign: 'left',
                                                            }}
                                                            onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f5')}
                                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                        >
                                                            <span>{item.icon}</span>
                                                            {item.label}
                                                        </button>
                                                    ))}
                                                    <div style={{ borderTop: '1px solid #f0f0f0', margin: '4px 0' }} />
                                                    <button
                                                        onClick={() => executeDelete(m.id)}
                                                        disabled={deleting === m.id}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 10,
                                                            width: '100%',
                                                            padding: '9px 14px',
                                                            background: 'none',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            fontSize: 13,
                                                            color: '#dc2626',
                                                            textAlign: 'left',
                                                        }}
                                                        onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                                                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                                    >
                                                        <span>🗑️</span>
                                                        {deleting === m.id ? '삭제 중...' : '삭제'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* AI: 프로필 이미지 + 이름 + 소개 */}
                                        <div
                                            className="manage-col-ai"
                                            style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', minWidth: 0 }}
                                            onClick={() => router.push(`/chat/${m.id}`)}
                                        >
                                            <div style={{
                                                width: 40, height: 40, borderRadius: '50%',
                                                background: '#f3f4f6',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                overflow: 'hidden',
                                                border: '1px solid #e5e7eb',
                                                flexShrink: 0,
                                            }}>
                                                {(m.avatar_url || MENTOR_IMAGES[m.name]) ? (
                                                    <img
                                                        src={m.avatar_url || MENTOR_IMAGES[m.name]}
                                                        alt={m.name}
                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    />
                                                ) : (
                                                    <img
                                                        src="/logo.png"
                                                        alt="큐리"
                                                        style={{ width: '70%', height: '70%', objectFit: 'contain', opacity: 0.35 }}
                                                    />
                                                )}
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{
                                                    fontSize: 14, fontWeight: 600, color: '#18181b',
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {m.name}
                                                </div>
                                                <div style={{
                                                    fontSize: 12, color: '#9ca3af', marginTop: 2,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                }}>
                                                    {m.title}
                                                </div>
                                                {/* AI별 통계 뱃지 */}
                                                {mentorStats[m.id] && mentorStats[m.id].messages > 0 && (
                                                    <div
                                                        onClick={(e) => { e.stopPropagation(); setExpandedMentor(expandedMentor === m.id ? null : m.id) }}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                                            marginTop: 4, fontSize: 11, color: '#6366f1',
                                                            background: '#eef2ff', padding: '2px 8px', borderRadius: 8,
                                                            cursor: 'pointer', fontWeight: 500,
                                                        }}
                                                    >
                                                        👤 {mentorStats[m.id].users}명 · 💬 {mentorStats[m.id].messages}개
                                                        <span style={{ fontSize: 9, opacity: 0.6 }}>{expandedMentor === m.id ? '▲' : '▼'}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* 생성일 */}
                                        <div className="manage-col-date" style={{ fontSize: 12, color: '#6b7280' }}>
                                            {new Date(m.created_at).toLocaleDateString('ko-KR')}
                                        </div>

                                        {/* 상태 토글 */}
                                        <div className="manage-col-status" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div
                                                onClick={async () => {
                                                    const newVal = !m.is_active
                                                    // 로컬 상태 즉시 업데이트
                                                    setMentors(prev => prev.map(item =>
                                                        item.id === m.id ? { ...item, is_active: newVal } : item
                                                    ))
                                                    try {
                                                        await fetch('/api/creator/mentor/update', {
                                                            method: 'PATCH',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ mentorId: m.id, isActive: newVal }),
                                                        })
                                                    } catch {
                                                        // 롤백
                                                        setMentors(prev => prev.map(item =>
                                                            item.id === m.id ? { ...item, is_active: !newVal } : item
                                                        ))
                                                    }
                                                }}
                                                style={{
                                                    width: 36, height: 20, borderRadius: 10,
                                                    background: m.is_active ? '#22c55e' : '#d1d5db',
                                                    cursor: 'pointer', transition: 'background 0.2s',
                                                    display: 'flex', alignItems: 'center', padding: '0 2px',
                                                    flexShrink: 0,
                                                }}
                                            >
                                                <div style={{
                                                    width: 16, height: 16, borderRadius: '50%',
                                                    background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                                    transition: 'transform 0.2s',
                                                    transform: m.is_active ? 'translateX(16px)' : 'translateX(0)',
                                                }} />
                                            </div>
                                            <span style={{
                                                fontSize: 11, fontWeight: 600,
                                                color: m.is_active ? '#15803d' : '#9ca3af',
                                            }}>
                                                {m.is_active ? 'Live' : '배포 전'}
                                            </span>
                                        </div>

                                        {/* 관리 버튼 */}
                                        <div className="manage-col-edit" style={{ display: 'flex', justifyContent: 'center' }}>
                                            <button
                                                onClick={() => router.push(`/creator/edit/${m.id}`)}
                                                style={{
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    fontSize: 13, padding: '6px 10px',
                                                    display: 'flex', alignItems: 'center', gap: 4,
                                                    color: '#374151', fontWeight: 500,
                                                    borderRadius: 6,
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = '#f3f4f6')}
                                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                            >✏️ 수정</button>
                                        </div>
                                    </div>
                                    {/* AI별 사용자 드롭다운 */}
                                    {expandedMentor === m.id && mentorStats[m.id]?.userList?.length > 0 && (
                                        <div style={{
                                            padding: '10px 16px 10px 68px',
                                            background: '#fafafa',
                                            borderBottom: '1px solid #f0f0f0',
                                            animation: 'fadeIn 0.2s ease',
                                        }}>
                                            <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, fontWeight: 600 }}>대화한 사용자</div>
                                            {mentorStats[m.id].userList.map((u: MentorUserStat, i: number) => (
                                                <div key={i} style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '4px 0', fontSize: 12, color: '#374151',
                                                }}>
                                                    <span>👤 {u.displayName}</span>
                                                    <span style={{ color: '#6366f1', fontWeight: 600 }}>💬 {u.messageCount}회</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </React.Fragment>
                                )
                            })}
                        </div>
                    )}

                    {/* 공유 모달 */}
                    {shareModal && (
                        <>
                            <div
                                onClick={() => { setShareModal(null); setCopied(false) }}
                                style={{
                                    position: 'fixed', inset: 0,
                                    background: 'rgba(0,0,0,0.4)', zIndex: 1000,
                                    animation: 'shareOverlayIn 0.2s ease',
                                }}
                            />
                            <div style={{
                                position: 'fixed', left: '50%', top: '50%',
                                transform: 'translate(-50%, -50%)',
                                background: '#fff', borderRadius: 20,
                                padding: '28px 24px 24px',
                                width: 'min(360px, calc(100vw - 48px))',
                                zIndex: 1001,
                                animation: 'shareModalIn 0.2s ease',
                            }}>
                                <style>{`
                                    @keyframes shareOverlayIn { from { opacity: 0; } to { opacity: 1; } }
                                    @keyframes shareModalIn { from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
                                `}</style>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#18181b' }}>공유하기</h3>
                                    <button
                                        onClick={() => { setShareModal(null); setCopied(false) }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9ca3af', fontSize: 20, lineHeight: 1 }}
                                    >✕</button>
                                </div>
                                <button
                                    onClick={async () => {
                                        const url = `${window.location.origin}/chat/${shareModal.id}`
                                        try { await navigator.clipboard.writeText(url) } catch {
                                            const input = document.createElement('input'); input.value = url;
                                            document.body.appendChild(input); input.select(); document.execCommand('copy'); document.body.removeChild(input)
                                        }
                                        setCopied(true); setTimeout(() => { setCopied(false); setShareModal(null) }, 1500)
                                    }}
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                        padding: '14px 16px', border: '1px solid #e5e7eb', borderRadius: 12,
                                        background: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 600,
                                        color: copied ? '#16a34a' : '#374151', marginBottom: 10,
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb' }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M6.5 8.5a3 3 0 004.24.35l2-2a3 3 0 00-4.24-4.24L7.25 3.86" />
                                        <path d="M9.5 7.5a3 3 0 00-4.24-.35l-2 2a3 3 0 004.24 4.24L8.75 12.14" />
                                    </svg>
                                    {copied ? '✓ 복사됨!' : '링크 복사하기'}
                                </button>
                                <button
                                    onClick={() => {
                                        const url = `${window.location.origin}/chat/${shareModal.id}`
                                        const w = window as any
                                        if (w.Kakao && !w.Kakao.isInitialized()) {
                                            w.Kakao.init('27c5c27a03c6f936db39d20090643b3c')
                                        }
                                        if (w.Kakao && w.Kakao.isInitialized()) {
                                            w.Kakao.Share.sendDefault({
                                                objectType: 'feed',
                                                content: {
                                                    title: `${shareModal.name} AI ㅣ ${shareModal.title}`,
                                                    description: '궁금한 것을 언제든 물어보세요.',
                                                    imageUrl: 'https://www.curi-ai.com/icons/icon-512x512.png',
                                                    link: { mobileWebUrl: url, webUrl: url },
                                                },
                                                buttons: [
                                                    { title: '대화하기', link: { mobileWebUrl: url, webUrl: url } },
                                                ],
                                            })
                                        } else {
                                            alert('카카오 공유를 불러오는 중입니다. 잠시 후 다시 시도해주세요.')
                                        }
                                        setShareModal(null)
                                    }}
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                        padding: '14px 16px', border: 'none', borderRadius: 12,
                                        background: '#FEE500', cursor: 'pointer', fontSize: 15, fontWeight: 600,
                                        color: '#3C1E1E', transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#fdd800' }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#FEE500' }}
                                >
                                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                        <path d="M9 1.5C4.86 1.5 1.5 4.14 1.5 7.38c0 2.08 1.38 3.9 3.45 4.94-.15.56-.55 2.03-.63 2.34-.1.39.14.38.3.28.12-.08 1.94-1.32 2.73-1.86.53.08 1.08.12 1.65.12 4.14 0 7.5-2.64 7.5-5.88S13.14 1.5 9 1.5z" fill="#3C1E1E"/>
                                    </svg>
                                    카카오 공유하기
                                </button>
                            </div>
                        </>
                    )}
                </div>
                <style>{`
                    @media (max-width: 768px) {
                        .sidebar-content {
                            margin-left: 0 !important;
                            padding-bottom: 72px;
                            padding-top: 48px;
                        }
                        .manage-table-header {
                            display: none !important;
                        }
                        .manage-table-row {
                            display: flex !important;
                            flex-wrap: wrap !important;
                            gap: 10px !important;
                            padding: 14px 16px !important;
                            border-bottom: 1px solid #f0f0f0 !important;
                        }
                        .manage-col-menu {
                            order: 3;
                        }
                        .manage-col-ai {
                            flex: 1 !important;
                            min-width: 0 !important;
                            order: 1;
                        }
                        .manage-col-status {
                            order: 2;
                            flex-shrink: 0;
                        }
                        .manage-col-date {
                            display: none !important;
                        }
                        .manage-col-edit {
                            display: none !important;
                        }
                    }
                    @media (max-width: 640px) {
                        .sidebar-content [style*="grid-template-columns: repeat(4"] {
                            grid-template-columns: repeat(2, 1fr) !important;
                        }
                    }
                `}</style>
            </div>
        </div>
    )
}
