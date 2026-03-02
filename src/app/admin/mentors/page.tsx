'use client'

import { useEffect, useState } from 'react'

interface MentorStat {
    mentor_id: string
    mentor_name: string
    mentor_slug: string
    mentor_title: string
    total_sessions: number
    unique_users: number
    total_messages: number
    last_active_at: string
    avg_messages_per_session: number
}

export default function MentorsPage() {
    const [mentors, setMentors] = useState<MentorStat[]>([])
    const [loading, setLoading] = useState(true)

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
                    border: '3px solid rgba(236,72,153,0.3)', borderTopColor: '#ec4899',
                    animation: 'spin 1s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
        )
    }

    const totalSessions = mentors.reduce((s, m) => s + (m.total_sessions || 0), 0)
    const totalUniqueUsers = mentors.reduce((s, m) => s + (m.unique_users || 0), 0)
    const totalMsgs = mentors.reduce((s, m) => s + (m.total_messages || 0), 0)
    const maxSessions = Math.max(...mentors.map(m => m.total_sessions || 0), 1)

    const MENTOR_COLORS: Record<string, string> = {
        '열정진': '#f59e0b',
        '글담쌤': '#6366f1',
        'Cathy': '#ec4899',
    }

    const MENTOR_EMOJIS: Record<string, string> = {
        '열정진': '🔥',
        '글담쌤': '📝',
        'Cathy': '💄',
    }

    const formatRelative = (d: string) => {
        if (!d) return '비활성'
        const diffH = Math.floor((Date.now() - new Date(d).getTime()) / 3600000)
        if (diffH < 1) return '🟢 방금 전'
        if (diffH < 24) return `🟢 ${diffH}시간 전`
        if (diffH < 48) return '🟡 어제'
        if (diffH < 168) return `🟡 ${Math.floor(diffH / 24)}일 전`
        return `🔴 ${Math.floor(diffH / 168)}주 전`
    }

    return (
        <div>
            {/* 헤더 */}
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>🤖 멘토 퍼포먼스</h1>
                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: '6px 0 0' }}>
                    {mentors.length}명 멘토 · 총 {totalSessions}세션
                </p>
            </div>

            {/* 요약 카드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                    { label: '총 세션', value: totalSessions, icon: '📱', color: '#60a5fa' },
                    { label: '고유 유저', value: totalUniqueUsers, icon: '👥', color: '#34d399' },
                    { label: '총 메시지', value: totalMsgs, icon: '💬', color: '#a78bfa' },
                ].map((c, i) => (
                    <div key={i} style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 14, padding: '16px 20px',
                        position: 'relative', overflow: 'hidden',
                    }}>
                        <span style={{ position: 'absolute', top: 12, right: 14, fontSize: 24, opacity: 0.12 }}>{c.icon}</span>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginBottom: 4 }}>{c.label}</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: c.color, fontVariantNumeric: 'tabular-nums' }}>
                            {c.value.toLocaleString()}
                        </div>
                    </div>
                ))}
            </div>

            {/* 멘토별 점유율 바 */}
            <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16, padding: 24, marginBottom: 20,
            }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: 'rgba(255,255,255,0.6)' }}>
                    📊 세션 점유율
                </h3>
                <div style={{
                    display: 'flex', height: 32, borderRadius: 16, overflow: 'hidden',
                    background: 'rgba(255,255,255,0.04)',
                }}>
                    {mentors.map(m => {
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
                                {pct > 10 && (
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                                        {m.mentor_name} {pct.toFixed(0)}%
                                    </span>
                                )}
                            </div>
                        )
                    })}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
                    {mentors.map(m => (
                        <span key={m.mentor_id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: MENTOR_COLORS[m.mentor_name] || '#6366f1' }} />
                            {m.mentor_name}
                        </span>
                    ))}
                </div>
            </div>

            {/* 멘토 카드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                {mentors.map(m => {
                    const color = MENTOR_COLORS[m.mentor_name] || '#6366f1'
                    const emoji = MENTOR_EMOJIS[m.mentor_name] || '🤖'
                    const sharePercent = totalSessions > 0 ? ((m.total_sessions / totalSessions) * 100).toFixed(1) : '0'
                    const activityPct = Math.min((m.total_sessions / maxSessions) * 100, 100)

                    return (
                        <div key={m.mentor_id} style={{
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)',
                            border: `1px solid ${color}20`,
                            borderRadius: 16, padding: 24,
                            position: 'relative', overflow: 'hidden',
                        }}>
                            {/* 배경 이모지 */}
                            <div style={{
                                position: 'absolute', top: -10, right: -10,
                                fontSize: 80, opacity: 0.04, transform: 'rotate(15deg)',
                            }}>{emoji}</div>

                            {/* 헤더 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                                <div style={{
                                    width: 48, height: 48, borderRadius: 14,
                                    background: `${color}20`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 24,
                                }}>{emoji}</div>
                                <div>
                                    <div style={{ fontSize: 18, fontWeight: 800 }}>{m.mentor_name}</div>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                                        {m.mentor_title || m.mentor_slug} · 점유율 {sharePercent}%
                                    </div>
                                </div>
                            </div>

                            {/* 메트릭 그리드 */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                                {[
                                    { label: '총 세션', value: m.total_sessions, color },
                                    { label: '고유 유저', value: m.unique_users, color: '#60a5fa' },
                                    { label: '총 메시지', value: m.total_messages, color: '#a78bfa' },
                                    { label: '세션당 평균', value: `${(m.avg_messages_per_session || 0).toFixed(1)}회`, color: '#f59e0b' },
                                ].map((metric, i) => (
                                    <div key={i} style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        borderRadius: 10, padding: '10px 14px',
                                    }}>
                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600, marginBottom: 2, textTransform: 'uppercase' }}>
                                            {metric.label}
                                        </div>
                                        <div style={{ fontSize: 18, fontWeight: 800, color: metric.color, fontVariantNumeric: 'tabular-nums' }}>
                                            {typeof metric.value === 'number' ? metric.value.toLocaleString() : metric.value}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* 활동도 바 */}
                            <div style={{ marginBottom: 8 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>활동도</span>
                                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{activityPct.toFixed(0)}%</span>
                                </div>
                                <div style={{
                                    height: 6, borderRadius: 3,
                                    background: 'rgba(255,255,255,0.06)',
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
                            <div style={{ textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                                {formatRelative(m.last_active_at)}
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
