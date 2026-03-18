'use client'

import { useEffect, useState } from 'react'

interface GuestLog {
    id: string
    mentor_name: string
    user_message: string
    ai_response: string
    message_index: number
    created_at: string
}

interface Stats {
    total: number
    todayCount: number
    mentorCounts: Record<string, number>
}

export default function GuestLogsPage() {
    const [logs, setLogs] = useState<GuestLog[]>([])
    const [stats, setStats] = useState<Stats | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetch('/api/admin/guest-logs')
            .then(r => r.json())
            .then(data => {
                setLogs(data.logs || [])
                setStats(data.stats || null)
            })
            .finally(() => setLoading(false))
    }, [])

    if (loading) {
        return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</div>
    }

    return (
        <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
                👤 비회원 대화 로그
            </h1>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
                로그인하지 않은 사용자들의 대화를 추적합니다. 배포 이후 새 대화부터 기록됩니다.
            </p>

            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 32 }}>
                    <div style={{ background: '#fff', borderRadius: 14, padding: '20px 18px', border: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>총 비회원 대화</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b' }}>{stats.total}</div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: 14, padding: '20px 18px', border: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>오늘</div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: '#22c55e' }}>{stats.todayCount}</div>
                    </div>
                    {Object.entries(stats.mentorCounts).map(([name, count]) => (
                        <div key={name} style={{ background: '#fff', borderRadius: 14, padding: '20px 18px', border: '1px solid #e5e7eb' }}>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{name}</div>
                            <div style={{ fontSize: 28, fontWeight: 800, color: '#8b5cf6' }}>{count}</div>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                            <th style={thStyle}>시간</th>
                            <th style={thStyle}>멘토</th>
                            <th style={thStyle}>유저 메시지</th>
                            <th style={thStyle}>AI 응답</th>
                            <th style={thStyle}>#</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                    아직 비회원 대화 로그가 없습니다. 배포 후 비회원이 대화하면 여기에 기록됩니다.
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
                                        <strong style={{ color: '#1e293b' }}>{log.mentor_name}</strong>
                                    </td>
                                    <td style={{ ...tdStyle, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {log.user_message}
                                    </td>
                                    <td style={{ ...tdStyle, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b' }}>
                                        {log.ai_response?.slice(0, 100)}
                                    </td>
                                    <td style={tdStyle}>
                                        <span style={{
                                            background: '#f0f9ff', color: '#3b82f6',
                                            borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                                        }}>
                                            {log.message_index}번째
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

const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '12px 16px', fontWeight: 700, color: '#475569', fontSize: 12,
}
const tdStyle: React.CSSProperties = {
    padding: '12px 16px', color: '#1e293b',
}
