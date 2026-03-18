'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Message {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    input_method: string
    tokens_used: number | null
    created_at: string
}

interface Session {
    id: string
    title: string | null
    message_count: number
    last_message_at: string | null
    created_at: string
    deleted_at: string | null
    has_voice?: boolean
    mentors: { id: string; name: string; slug: string; avatar_url: string | null } | null
}

interface UserDetail {
    id: string
    email: string
    display_name: string
    avatar_url: string | null
    membership_tier: string
    concern: string | null
    onboarding_completed: boolean
    created_at: string
    phone: string | null
    marketing_consent: boolean | null
    clovers: number | null
    gender: string | null
    referral_code: string | null
}

interface UserResponse {
    user: UserDetail
    sessions: Session[]
    stats: {
        totalSessions: number
        totalMessages: number
        uniqueMentors: number
        mentorNames: string[]
    }
}

export default function UserDetailPage() {
    const { userId } = useParams<{ userId: string }>()
    const [data, setData] = useState<UserResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [expandedSession, setExpandedSession] = useState<string | null>(null)
    const [messages, setMessages] = useState<Record<string, Message[]>>({})
    const [loadingMessages, setLoadingMessages] = useState<string | null>(null)

    useEffect(() => {
        fetch(`/api/admin/users/${userId}`)
            .then(r => r.json())
            .then(d => {
                if (d.error) throw new Error(d.error)
                setData(d)
            })
            .catch(e => console.error(e))
            .finally(() => setLoading(false))
    }, [userId])

    const toggleSession = async (sessionId: string) => {
        if (expandedSession === sessionId) {
            setExpandedSession(null)
            return
        }
        setExpandedSession(sessionId)

        if (!messages[sessionId]) {
            setLoadingMessages(sessionId)
            try {
                const res = await fetch(`/api/admin/sessions/${sessionId}/messages`)
                const data = await res.json()
                setMessages(prev => ({ ...prev, [sessionId]: data.messages || [] }))
            } catch (e) {
                console.error(e)
            } finally {
                setLoadingMessages(null)
            }
        }
    }

    const formatTime = (d: string) => {
        if (!d) return '—'
        const date = new Date(d)
        return date.toLocaleString('ko-KR', {
            month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })
    }

    const formatRelative = (d: string) => {
        if (!d) return '—'
        const diff = Date.now() - new Date(d).getTime()
        const h = Math.floor(diff / 3600000)
        if (h < 1) return '방금 전'
        if (h < 24) return `${h}시간 전`
        const days = Math.floor(h / 24)
        if (days < 7) return `${days}일 전`
        return new Date(d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <div style={{ color: '#94a3b8', fontSize: 14 }}>로딩 중...</div>
            </div>
        )
    }

    if (!data) {
        return (
            <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                유저를 찾을 수 없습니다
                <br /><br />
                <Link href="/admin/users" style={{ color: '#6366f1', textDecoration: 'none' }}>← 유저 목록으로</Link>
            </div>
        )
    }

    const { user, sessions, stats } = data

    return (
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
            {/* 뒤로 가기 */}
            <Link
                href="/admin/users"
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    color: '#94a3b8', fontSize: 13, textDecoration: 'none',
                    marginBottom: 20, transition: 'color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#4f46e5')}
                onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
            >
                ← 유저 목록
            </Link>

            {/* 유저 프로필 카드 */}
            <div style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 20, padding: 28, marginBottom: 24,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    {user.avatar_url ? (
                        <img src={user.avatar_url} alt=""
                            style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    ) : (
                        <div style={{
                            width: 56, height: 56, borderRadius: '50%',
                            background: `hsl(${user.id.charCodeAt(0) * 7 % 360}, 45%, 65%)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 22, fontWeight: 700, flexShrink: 0, color: '#fff',
                        }}>
                            {(user.display_name || user.email || '?')[0]?.toUpperCase()}
                        </div>
                    )}
                    <div style={{ flex: 1 }}>
                        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: '#1e293b' }}>
                            {user.display_name || '이름 없음'}
                        </h1>
                        <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
                            {user.email} · {user.membership_tier === 'free' ? '무료' : user.membership_tier} · 가입일 {new Date(user.created_at).toLocaleDateString('ko-KR')}
                        </div>
                        {user.concern && (
                            <div style={{
                                marginTop: 10, fontSize: 13, color: '#64748b',
                                background: '#f8fafc', padding: '8px 14px',
                                borderRadius: 10, borderLeft: '3px solid #6366f1',
                            }}>
                                💬 고민: {user.concern}
                            </div>
                        )}
                    </div>
                </div>

                {/* 통계 카드 */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: 12, marginTop: 20,
                }}>
                    {[
                        { label: '총 세션', value: stats.totalSessions, icon: '💬' },
                        { label: '총 메시지', value: stats.totalMessages, icon: '📝' },
                        { label: '멘토 이용', value: stats.uniqueMentors, icon: '🤖' },
                        { label: '멘토', value: stats.mentorNames.join(', ') || '—', icon: '👤' },
                        { label: '클로버', value: user.clovers || 0, icon: '🍀' },
                    ].map((s, i) => (
                        <div key={i} style={{
                            background: '#f8fafc', borderRadius: 12,
                            padding: '14px 16px', textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                                {s.icon} {s.label}
                            </div>
                            <div style={{
                                fontSize: typeof s.value === 'number' ? 22 : 13,
                                fontWeight: 700, color: '#1e293b',
                                fontVariantNumeric: 'tabular-nums',
                            }}>
                                {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
                            </div>
                        </div>
                    ))}
                </div>

                {/* 프로필 상세 정보 */}
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: 10, marginTop: 14,
                }}>
                    {[
                        { label: '휴대폰', value: user.phone || '—', icon: '📱' },
                        { label: '성별', value: user.gender === '남' ? '🙍‍♂️ 남' : user.gender === '여' ? '🙍‍♀️ 여' : '—', icon: '' },
                        { label: '마케팅', value: user.marketing_consent ? '✅ 동의' : '❌ 미동의', icon: '' },
                        { label: '초대코드', value: user.referral_code || '—', icon: '🔗' },
                    ].map((s, i) => (
                        <div key={i} style={{
                            background: '#f1f5f9', borderRadius: 10,
                            padding: '10px 14px', textAlign: 'center',
                        }}>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>
                                {s.icon} {s.label}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                                {s.value}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 세션 목록 */}
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, color: '#1e293b' }}>
                📋 대화 세션 ({sessions.length})
            </h2>

            {sessions.length === 0 ? (
                <div style={{
                    textAlign: 'center', padding: 40,
                    color: '#94a3b8', fontSize: 13,
                    background: '#fff',
                    borderRadius: 16, border: '1px solid #e5e7eb',
                }}>
                    아직 대화 기록이 없습니다
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sessions.map((session) => {
                        const isExpanded = expandedSession === session.id
                        const mentor = session.mentors as { id: string; name: string; slug: string; avatar_url: string | null } | null
                        const sessionMessages = messages[session.id]

                        return (
                            <div key={session.id} style={{
                                background: session.deleted_at
                                    ? '#fef2f2'
                                    : isExpanded ? '#f8f7ff' : '#fff',
                                border: `1px solid ${session.deleted_at ? '#fecaca' : isExpanded ? '#c7d2fe' : '#e5e7eb'}`,
                                borderRadius: 16, overflow: 'hidden',
                                transition: 'all 0.2s',
                                opacity: session.deleted_at ? 0.7 : 1,
                                boxShadow: isExpanded ? '0 4px 12px rgba(99,102,241,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
                            }}>
                                {/* 세션 헤더 */}
                                <button
                                    onClick={() => toggleSession(session.id)}
                                    style={{
                                        width: '100%', padding: '16px 20px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        background: 'none', border: 'none', color: '#1e293b',
                                        cursor: 'pointer', textAlign: 'left',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                                        {mentor?.avatar_url ? (
                                            <img src={mentor.avatar_url} alt="" style={{
                                                width: 36, height: 36, borderRadius: 10,
                                                objectFit: 'cover', flexShrink: 0,
                                            }} />
                                        ) : (
                                            <div style={{
                                                width: 36, height: 36, borderRadius: 10,
                                                background: '#f0f0ff',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 16, flexShrink: 0,
                                            }}>
                                                🤖
                                            </div>
                                        )}
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{
                                                fontSize: 14, fontWeight: 600, color: '#1e293b',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                display: 'flex', alignItems: 'center', gap: 6,
                                            }}>
                                                {session.title || `${mentor?.name || '멘토'} 대화`}
                                                {(session as Session).has_voice ? (
                                                    <span style={{
                                                        fontSize: 10, color: '#059669', background: '#d1fae5',
                                                        padding: '2px 7px', borderRadius: 8, fontWeight: 700,
                                                        display: 'inline-flex', alignItems: 'center', gap: 3,
                                                    }}>📞 전화</span>
                                                ) : (
                                                    <span style={{
                                                        fontSize: 10, color: '#6366f1', background: '#e0e7ff',
                                                        padding: '2px 7px', borderRadius: 8, fontWeight: 700,
                                                        display: 'inline-flex', alignItems: 'center', gap: 3,
                                                    }}>💬 채팅</span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 600, color: '#6366f1' }}>{mentor?.name || '알 수 없음'}</span>
                                                <span>· {session.message_count || 0}개 메시지 · {formatRelative(session.last_message_at || session.created_at)}</span>
                                                {session.deleted_at && (
                                                    <span style={{
                                                        fontSize: 10, color: '#dc2626',
                                                        background: '#fee2e2',
                                                        padding: '2px 6px', borderRadius: 6, fontWeight: 600,
                                                    }}>
                                                        🗑 삭제됨 ({formatRelative(session.deleted_at)})
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <span style={{
                                        fontSize: 16, color: '#94a3b8',
                                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)',
                                        transition: 'transform 0.2s',
                                        flexShrink: 0, marginLeft: 12,
                                    }}>
                                        ▼
                                    </span>
                                </button>

                                {/* 메시지 목록 (확장 시) — 유저 화면처럼 보이도록 */}
                                {isExpanded && (
                                    <div style={{
                                        borderTop: '1px solid #e5e7eb',
                                        padding: '16px 20px',
                                        maxHeight: 600, overflowY: 'auto',
                                        background: '#f8f9fb',
                                    }}>
                                        {loadingMessages === session.id ? (
                                            <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>
                                                메시지 로딩 중...
                                            </div>
                                        ) : !sessionMessages?.length ? (
                                            <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>
                                                메시지 없음
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                {sessionMessages.filter(m => m.role !== 'system').map((msg) => {
                                                    const isUser = msg.role === 'user'
                                                    return (
                                                        <div key={msg.id} style={{
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: isUser ? 'flex-end' : 'flex-start',
                                                        }}>
                                                            <div style={{
                                                                display: 'flex', alignItems: 'center', gap: 6,
                                                                marginBottom: 4,
                                                            }}>
                                                                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                                                    {isUser ? `👤 ${user.display_name || '유저'}` : `🤖 ${mentor?.name || 'AI'}`}
                                                                </span>
                                                                <span style={{ fontSize: 10, color: '#cbd5e1' }}>
                                                                    {formatTime(msg.created_at)}
                                                                </span>
                                                                {msg.input_method === 'stt' && (
                                                                    <span style={{
                                                                        fontSize: 9, color: '#d97706',
                                                                        background: '#fef3c7',
                                                                        padding: '2px 6px', borderRadius: 8,
                                                                    }}>
                                                                        🎤 음성
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{
                                                                maxWidth: '80%',
                                                                padding: '10px 14px',
                                                                borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                                                background: isUser
                                                                    ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                                                                    : '#fff',
                                                                color: isUser ? '#fff' : '#1e293b',
                                                                fontSize: 13, lineHeight: 1.6,
                                                                wordBreak: 'break-word',
                                                                whiteSpace: 'pre-wrap',
                                                                border: isUser ? 'none' : '1px solid #e5e7eb',
                                                                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                                            }}>
                                                                {msg.content}
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
