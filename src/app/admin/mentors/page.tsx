'use client'

import { useEffect, useState } from 'react'
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

interface MentorStat {
    mentor_id: string
    mentor_name: string
    mentor_slug: string
    mentor_title: string
    avatar_url: string | null
    status: 'active' | 'inactive' | 'deleted'
    description: string
    expertise: string[]
    creator_id: string | null
    creator_name: string | null
    created_at: string
    has_voice: boolean
    has_greeting: boolean
    knowledge_count: number
    total_sessions: number
    member_sessions: number
    guest_sessions: number
    unique_users: number
    total_messages: number
    last_active_at: string
    avg_messages_per_session: number
}

type StatusFilter = 'all' | 'active' | 'inactive' | 'deleted'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    active: { label: '활성', color: '#16a34a', bg: '#f0fdf4', icon: '🟢' },
    inactive: { label: '비활성', color: '#d97706', bg: '#fffbeb', icon: '🟡' },
    deleted: { label: '삭제', color: '#ef4444', bg: '#fef2f2', icon: '🔴' },
}

export default function MentorsPage() {
    const [mentors, setMentors] = useState<MentorStat[]>([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

    useEffect(() => {
        fetch('/api/admin/mentors')
            .then(r => r.json())
            .then(d => setMentors(d.mentors || []))
            .catch(e => console.error(e))
            .finally(() => setLoading(false))
    }, [])

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    border: '3px solid #fce7f3', borderTopColor: '#ec4899',
                    animation: 'spin 1s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
        )
    }

    const filteredMentors = statusFilter === 'all'
        ? mentors
        : mentors.filter(m => m.status === statusFilter)

    const statusCounts = {
        all: mentors.length,
        active: mentors.filter(m => m.status === 'active').length,
        inactive: mentors.filter(m => m.status === 'inactive').length,
        deleted: mentors.filter(m => m.status === 'deleted').length,
    }

    const totalSessions = mentors.reduce((s, m) => s + (m.total_sessions || 0), 0)
    const totalUniqueUsers = mentors.reduce((s, m) => s + (m.unique_users || 0), 0)
    const totalMsgs = mentors.reduce((s, m) => s + (m.total_messages || 0), 0)
    const maxSessions = Math.max(...mentors.map(m => m.total_sessions || 0), 1)

    const MENTOR_COLORS: Record<string, string> = {
        '열정진': '#f59e0b',
        '갓출리더의 횃병상담소': '#8b5cf6',
        '글담쌤': '#6366f1',
        'Cathy': '#ec4899',
        '봉이 김선달': '#14b8a6',
        '김종완': '#3b82f6',
        '컬러레 AI': '#a855f7',
    }

    const formatRelative = (d: string) => {
        if (!d) return '비활성'
        const diffH = Math.floor((Date.now() - new Date(d).getTime()) / 3600000)
        if (diffH < 1) return '방금 전'
        if (diffH < 24) return `${diffH}시간 전`
        if (diffH < 48) return '어제'
        if (diffH < 168) return `${Math.floor(diffH / 24)}일 전`
        return `${Math.floor(diffH / 168)}주 전`
    }

    const formatDate = (d: string) => {
        if (!d) return '—'
        return new Date(d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    }

    return (
        <div>
            {/* 헤더 */}
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#1e293b' }}>🤖 멘토 관리</h1>
                <p style={{ color: '#94a3b8', fontSize: 13, margin: '6px 0 0' }}>
                    총 {mentors.length}명 · 활성 {statusCounts.active}명 · 비활성 {statusCounts.inactive}명
                </p>
            </div>

            {/* 요약 카드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                {[
                    { label: '총 세션', value: totalSessions, icon: '📱', color: '#3b82f6' },
                    { label: '고유 유저', value: totalUniqueUsers, icon: '👥', color: '#16a34a' },
                    { label: '총 메시지', value: totalMsgs, icon: '💬', color: '#7c3aed' },
                ].map((c, i) => (
                    <div key={i} style={{
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 14, padding: '16px 20px',
                        position: 'relative', overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}>
                        <span style={{ position: 'absolute', top: 12, right: 14, fontSize: 24, opacity: 0.12 }}>{c.icon}</span>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>{c.label}</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: c.color, fontVariantNumeric: 'tabular-nums' }}>
                            {c.value.toLocaleString()}
                        </div>
                    </div>
                ))}
            </div>

            {/* 상태 필터 탭 */}
            <div style={{
                display: 'flex', gap: 8, marginBottom: 20,
                background: '#fff', border: '1px solid #e5e7eb',
                borderRadius: 14, padding: 6,
            }}>
                {([
                    { key: 'all' as StatusFilter, label: '전체', icon: '📋' },
                    { key: 'active' as StatusFilter, label: '활성', icon: '🟢' },
                    { key: 'inactive' as StatusFilter, label: '비활성', icon: '🟡' },
                    { key: 'deleted' as StatusFilter, label: '삭제', icon: '🔴' },
                ]).map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setStatusFilter(tab.key)}
                        style={{
                            flex: 1,
                            padding: '10px 16px',
                            borderRadius: 10,
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 13,
                            fontWeight: statusFilter === tab.key ? 700 : 500,
                            color: statusFilter === tab.key ? '#1e293b' : '#94a3b8',
                            background: statusFilter === tab.key ? '#f1f5f9' : 'transparent',
                            transition: 'all 0.15s',
                        }}
                    >
                        {tab.icon} {tab.label} ({statusCounts[tab.key]})
                    </button>
                ))}
            </div>

            {/* 세션 점유율 바 — 전체 탭일 때만 */}
            {statusFilter === 'all' && (
                <div style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 16, padding: 24, marginBottom: 20,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: '#64748b' }}>
                        📊 세션 점유율
                    </h3>
                    <div style={{
                        display: 'flex', height: 32, borderRadius: 16, overflow: 'hidden',
                        background: '#f1f5f9',
                    }}>
                        {mentors.filter(m => m.status === 'active').map(m => {
                            const pct = totalSessions > 0 ? (m.total_sessions / totalSessions) * 100 : 0
                            if (pct < 1) return null
                            return (
                                <div
                                    key={m.mentor_id}
                                    style={{
                                        width: `${pct}%`,
                                        background: MENTOR_COLORS[m.mentor_name] || '#6366f1',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        transition: 'width 0.5s ease',
                                    }}
                                >
                                    {pct > 8 && (
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                                            {m.mentor_name} {pct.toFixed(0)}%
                                        </span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                        {mentors.filter(m => m.status === 'active').map(m => (
                            <span key={m.mentor_id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: MENTOR_COLORS[m.mentor_name] || '#6366f1' }} />
                                {m.mentor_name}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* 멘토 카드 */}
            {filteredMentors.length === 0 ? (
                <div style={{
                    textAlign: 'center', padding: '60px 20px',
                    color: '#94a3b8', fontSize: 14,
                }}>
                    해당 상태의 멘토가 없습니다.
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                    {filteredMentors.map(m => {
                        const color = MENTOR_COLORS[m.mentor_name] || '#6366f1'
                        const sharePercent = totalSessions > 0 ? ((m.total_sessions / totalSessions) * 100).toFixed(1) : '0'
                        const activityPct = Math.min((m.total_sessions / maxSessions) * 100, 100)
                        const statusConf = STATUS_CONFIG[m.status] || STATUS_CONFIG.active

                        return (
                            <div key={m.mentor_id} style={{
                                background: '#fff',
                                border: `1px solid ${m.status === 'deleted' ? '#fecaca' : m.status === 'inactive' ? '#fde68a' : '#e5e7eb'}`,
                                borderRadius: 16, padding: 24,
                                position: 'relative', overflow: 'hidden',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                                opacity: m.status === 'deleted' ? 0.6 : 1,
                            }}>
                                {/* 상태 뱃지 */}
                                <div style={{
                                    position: 'absolute', top: 16, right: 16,
                                    fontSize: 11, fontWeight: 700,
                                    color: statusConf.color,
                                    background: statusConf.bg,
                                    padding: '3px 10px',
                                    borderRadius: 20,
                                    border: `1px solid ${statusConf.color}20`,
                                }}>
                                    {statusConf.icon} {statusConf.label}
                                </div>

                                {/* 프로필 헤더 */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                                    {/* 아바타 */}
                                    <div style={{
                                        width: 56, height: 56, borderRadius: 16,
                                        background: `${color}15`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        overflow: 'hidden',
                                        flexShrink: 0,
                                        border: `2px solid ${color}30`,
                                    }}>
                                        {(m.avatar_url || MENTOR_IMAGES[m.mentor_name]) ? (
                                            <Image
                                                src={m.avatar_url || MENTOR_IMAGES[m.mentor_name]}
                                                alt={m.mentor_name}
                                                width={56}
                                                height={56}
                                                style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                                                unoptimized
                                            />
                                        ) : (
                                            <span style={{ fontSize: 28 }}>🤖</span>
                                        )}
                                    </div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{m.mentor_name}</div>
                                        <div style={{
                                            fontSize: 12, color: '#94a3b8',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>
                                            {m.mentor_title || m.mentor_slug}
                                        </div>
                                    </div>
                                </div>

                                {/* 설명 */}
                                {m.description && (
                                    <div style={{
                                        fontSize: 12, color: '#64748b', lineHeight: 1.6,
                                        marginBottom: 12,
                                        display: '-webkit-box', WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                                    }}>
                                        {m.description}
                                    </div>
                                )}

                                {/* 전문분야 태그 */}
                                {m.expertise && m.expertise.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
                                        {m.expertise.slice(0, 4).map((e, i) => (
                                            <span key={i} style={{
                                                fontSize: 11, fontWeight: 600,
                                                color: color, background: `${color}10`,
                                                borderRadius: 6, padding: '2px 8px',
                                            }}>
                                                #{e}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* 상세 정보 배지 */}
                                <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                                    {m.creator_name && (
                                        <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', borderRadius: 6, padding: '2px 8px' }}>
                                            👤 {m.creator_name}
                                        </span>
                                    )}
                                    <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', borderRadius: 6, padding: '2px 8px' }}>
                                        📚 지식 {m.knowledge_count}개
                                    </span>
                                    {m.has_voice && (
                                        <span style={{ fontSize: 11, color: '#16a34a', background: '#f0fdf4', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
                                            📞 전화지원
                                        </span>
                                    )}
                                    {m.has_greeting && (
                                        <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', borderRadius: 6, padding: '2px 8px' }}>
                                            👋 인사말
                                        </span>
                                    )}
                                    <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', borderRadius: 6, padding: '2px 8px' }}>
                                        📅 {formatDate(m.created_at)}
                                    </span>
                                </div>

                                {/* 메트릭 그리드 */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                                    {[
                                        { label: '회원 세션', value: m.member_sessions || 0, color },
                                        { label: '비회원', value: m.guest_sessions || 0, color: '#94a3b8' },
                                        { label: '고유 유저', value: m.unique_users, color: '#3b82f6' },
                                        { label: '총 메시지', value: m.total_messages, color: '#7c3aed' },
                                        { label: '세션 평균', value: `${(m.avg_messages_per_session || 0).toFixed(1)}회`, color: '#d97706' },
                                        { label: '점유율', value: `${sharePercent}%`, color: '#16a34a' },
                                    ].map((metric, i) => (
                                        <div key={i} style={{
                                            background: '#f8fafc',
                                            borderRadius: 8, padding: '8px 10px',
                                        }}>
                                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 1 }}>
                                                {metric.label}
                                            </div>
                                            <div style={{ fontSize: 16, fontWeight: 800, color: metric.color, fontVariantNumeric: 'tabular-nums' }}>
                                                {typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* 활동도 바 */}
                                <div style={{ marginBottom: 6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>활동도</span>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{activityPct.toFixed(0)}%</span>
                                    </div>
                                    <div style={{
                                        height: 5, borderRadius: 3,
                                        background: '#f1f5f9',
                                        overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            width: `${activityPct}%`,
                                            height: '100%',
                                            borderRadius: 3,
                                            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                                            transition: 'width 0.5s ease',
                                        }} />
                                    </div>
                                </div>

                                {/* 마지막 활동 */}
                                <div style={{ textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>
                                    마지막 활동: {formatRelative(m.last_active_at)}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
