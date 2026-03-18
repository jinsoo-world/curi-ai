'use client'

import { useEffect, useState } from 'react'

interface MatchLog {
    id: string
    user_id: string | null
    concern: string
    matched_mentor_name: string
    match_reason: string
    match_type: string
    is_guest: boolean
    clicked_start: boolean
    created_at: string
    user_display: string
}

interface Stats {
    total: number
    guestCount: number
    memberCount: number
    mentorCounts: Record<string, number>
}

export default function MatchLogsPage() {
    const [logs, setLogs] = useState<MatchLog[]>([])
    const [stats, setStats] = useState<Stats | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch('/api/admin/match-logs')
            .then(r => r.json())
            .then(data => {
                setLogs(data.logs || [])
                const s = data.stats || {}
                setStats({
                    total: s.total || 0,
                    guestCount: s.guestCount || 0,
                    memberCount: s.memberCount || 0,
                    mentorCounts: s.mentorCounts || {},
                })
            })
            .catch(() => setStats({ total: 0, guestCount: 0, memberCount: 0, mentorCounts: {} }))
            .finally(() => setLoading(false))
    }, [])

    if (loading) {
        return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</div>
    }

    return (
        <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
                🎯 멘토 매칭 트래킹
            </h1>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
                유저들이 AI 멘토 찾기에서 어떤 고민을 입력하고 어떤 멘토로 매칭되었는지 추적합니다.
            </p>

            {/* 통계 카드 */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
                    <StatCard label="총 매칭" value={stats.total} color="#22c55e" />
                    <StatCard label="회원" value={stats.memberCount} color="#3b82f6" />
                    <StatCard label="비회원" value={stats.guestCount} color="#f59e0b" />
                    {Object.entries(stats.mentorCounts || {}).map(([name, count]) => (
                        <StatCard key={name} label={name} value={count} color="#8b5cf6" />
                    ))}
                </div>
            )}

            {/* 로그 테이블 */}
            <div style={{
                background: '#fff',
                borderRadius: 16,
                border: '1px solid #e5e7eb',
                overflow: 'hidden',
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                            <th style={thStyle}>시간</th>
                            <th style={thStyle}>유저</th>
                            <th style={thStyle}>고민 내용</th>
                            <th style={thStyle}>매칭 멘토</th>
                            <th style={thStyle}>매칭 이유</th>
                            <th style={thStyle}>유형</th>
                            <th style={thStyle}>클릭</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                    아직 매칭 로그가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            logs.map(log => (
                                <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={tdStyle}>
                                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                            {new Date(log.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                                            {' '}
                                            {new Date(log.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </td>
                                    <td style={tdStyle}>
                                        <span style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 4,
                                            background: log.is_guest ? '#fef3c7' : '#dbeafe',
                                            color: log.is_guest ? '#92400e' : '#1e40af',
                                            borderRadius: 8, padding: '2px 8px',
                                            fontSize: 11, fontWeight: 600,
                                        }}>
                                            {log.is_guest ? '👤 비회원' : log.user_display}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {log.concern}
                                    </td>
                                    <td style={tdStyle}>
                                        <strong style={{ color: '#1e293b' }}>{log.matched_mentor_name}</strong>
                                    </td>
                                    <td style={tdStyle}>
                                        <span style={{ color: '#64748b' }}>{log.match_reason}</span>
                                    </td>
                                    <td style={tdStyle}>
                                        <span style={{
                                            display: 'inline-flex',
                                            background: log.match_type === 'gemini' ? '#f0fdf4' : '#f8fafc',
                                            color: log.match_type === 'gemini' ? '#16a34a' : '#94a3b8',
                                            borderRadius: 6, padding: '2px 8px',
                                            fontSize: 11, fontWeight: 600,
                                        }}>
                                            {log.match_type === 'gemini' ? '✨ AI' : '🔑 키워드'}
                                        </span>
                                    </td>
                                    <td style={tdStyle}>
                                        <span style={{
                                            display: 'inline-flex',
                                            background: log.clicked_start ? '#f0fdf4' : '#fef2f2',
                                            color: log.clicked_start ? '#16a34a' : '#ef4444',
                                            borderRadius: 6, padding: '2px 8px',
                                            fontSize: 11, fontWeight: 600,
                                        }}>
                                            {log.clicked_start ? '✅ 클릭' : '❌ 이탈'}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div style={{
            background: '#fff',
            borderRadius: 14,
            padding: '20px 18px',
            border: '1px solid #e5e7eb',
        }}>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
        </div>
    )
}

const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: 12,
}
const tdStyle: React.CSSProperties = {
    padding: '12px 16px', color: '#1e293b',
}
