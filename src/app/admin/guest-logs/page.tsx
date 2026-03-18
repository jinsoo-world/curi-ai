'use client'

import { useEffect, useState } from 'react'

interface GuestLog {
    id: string
    mentor_name: string
    user_message: string
    ai_response: string
    message_index: number
    created_at: string
    ip_address: string | null
    device_type: string | null
    os: string | null
    browser: string | null
    country: string | null
    city: string | null
    visitor_id: string | null
    converted: boolean
    converted_user: { email: string; display_name: string | null; converted_at: string | null } | null
}

interface Stats {
    total: number
    todayCount: number
    uniqueVisitors: number
    convertedCount: number
    mentorCounts: Record<string, number>
    countryCounts: Record<string, number>
    deviceCounts: Record<string, number>
}

// 국가 코드 → 이모지 플래그
const countryFlag = (code: string) => {
    if (!code || code.length !== 2) return '🌍'
    const offset = 127397
    return String.fromCodePoint(...[...code.toUpperCase()].map(c => c.charCodeAt(0) + offset))
}

const COUNTRY_NAMES: Record<string, string> = {
    KR: '한국', US: '미국', JP: '일본', CN: '중국', TW: '대만',
    GB: '영국', DE: '독일', FR: '프랑스', CA: '캐나다', AU: '호주',
    SG: '싱가포르', VN: '베트남', TH: '태국', IN: '인도', ID: '인도네시아',
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
                const s = data.stats || {}
                setStats({
                    total: s.total || 0,
                    todayCount: s.todayCount || 0,
                    uniqueVisitors: s.uniqueVisitors || 0,
                    convertedCount: s.convertedCount || 0,
                    mentorCounts: s.mentorCounts || {},
                    countryCounts: s.countryCounts || {},
                    deviceCounts: s.deviceCounts || {},
                })
            })
            .catch(() => setStats({ total: 0, todayCount: 0, uniqueVisitors: 0, convertedCount: 0, mentorCounts: {}, countryCounts: {}, deviceCounts: {} }))
            .finally(() => setLoading(false))
    }, [])

    if (loading) {
        return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</div>
    }

    return (
        <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>
                👤 비회원 대화 로그
            </h1>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
                비회원 사용자들의 대화 및 접속 정보를 추적합니다.
            </p>

            {/* 요약 카드 */}
            {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
                    <StatCard label="총 대화" value={stats.total} color="#f59e0b" icon="💬" />
                    <StatCard label="오늘" value={stats.todayCount} color="#22c55e" icon="📅" />
                    <StatCard label="고유 방문자" value={stats.uniqueVisitors} color="#3b82f6" icon="👥" />
                    <StatCard label="회원 전환" value={stats.convertedCount} color="#ec4899" icon="🔄" />
                    {Object.entries(stats.deviceCounts).map(([device, count]) => (
                        <StatCard key={device} label={device} value={count} color="#8b5cf6" icon={device === '모바일' ? '📱' : device === '데스크톱' ? '💻' : '📟'} />
                    ))}
                </div>
            )}

            {/* 접속 지역 + 멘토별 분포 */}
            {stats && (Object.keys(stats.countryCounts).length > 0 || Object.keys(stats.mentorCounts).length > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
                    {Object.keys(stats.countryCounts).length > 0 && (
                        <div style={cardStyle}>
                            <h3 style={cardTitleStyle}>🌍 접속 지역</h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {Object.entries(stats.countryCounts)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([code, count]) => (
                                        <span key={code} style={{
                                            fontSize: 13, background: '#f1f5f9', borderRadius: 8,
                                            padding: '4px 10px', color: '#475569',
                                        }}>
                                            {countryFlag(code)} {COUNTRY_NAMES[code] || code} <b>{count}</b>
                                        </span>
                                    ))}
                            </div>
                        </div>
                    )}
                    {Object.keys(stats.mentorCounts).length > 0 && (
                        <div style={cardStyle}>
                            <h3 style={cardTitleStyle}>🤖 멘토별 대화</h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {Object.entries(stats.mentorCounts)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([name, count]) => (
                                        <span key={name} style={{
                                            fontSize: 13, background: '#f0f0ff', borderRadius: 8,
                                            padding: '4px 10px', color: '#4f46e5',
                                        }}>
                                            {name} <b>{count}</b>
                                        </span>
                                    ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 대화 테이블 */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e5e7eb' }}>
                            <th style={thStyle}>시간</th>
                            <th style={thStyle}>멘토</th>
                            <th style={thStyle}>유저 메시지</th>
                            <th style={thStyle}>AI 응답</th>
                            <th style={thStyle}>기기</th>
                            <th style={thStyle}>지역</th>
                            <th style={thStyle}>전환</th>
                            <th style={thStyle}>#</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                    아직 비회원 대화 로그가 없습니다. Supabase SQL을 먼저 실행해 주세요.
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
                                    <td style={{ ...tdStyle, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {log.user_message}
                                    </td>
                                    <td style={{ ...tdStyle, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#64748b' }}>
                                        {log.ai_response?.slice(0, 100)}
                                    </td>
                                    <td style={tdStyle}>
                                        {log.device_type && (
                                            <span style={{
                                                fontSize: 11, background: '#f0f9ff', color: '#3b82f6',
                                                borderRadius: 6, padding: '2px 6px', fontWeight: 500,
                                            }}>
                                                {log.device_type === '모바일' ? '📱' : log.device_type === '데스크톱' ? '💻' : '📟'} {log.device_type}
                                            </span>
                                        )}
                                        {log.os && (
                                            <span style={{ fontSize: 10, color: '#94a3b8', display: 'block', marginTop: 2 }}>
                                                {log.os} · {log.browser}
                                            </span>
                                        )}
                                    </td>
                                    <td style={tdStyle}>
                                        {log.country ? (
                                            <span style={{ fontSize: 12 }}>
                                                {countryFlag(log.country)} {log.city || log.country}
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: 12, color: '#cbd5e1' }}>—</span>
                                        )}
                                    </td>
                                    <td style={tdStyle}>
                                        {log.converted ? (
                                            <div>
                                                <span style={{
                                                    fontSize: 11, background: '#fce7f3', color: '#ec4899',
                                                    borderRadius: 6, padding: '2px 8px', fontWeight: 700,
                                                }}>
                                                    ✅ 회원 전환
                                                </span>
                                                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                                                    {log.converted_user?.display_name || log.converted_user?.email?.split('@')[0] || ''}
                                                </div>
                                            </div>
                                        ) : (
                                            <span style={{ fontSize: 12, color: '#cbd5e1' }}>—</span>
                                        )}
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

function StatCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
    return (
        <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border: '1px solid #e5e7eb', position: 'relative', overflow: 'hidden' }}>
            <span style={{ position: 'absolute', top: 10, right: 12, fontSize: 20, opacity: 0.12 }}>{icon}</span>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color }}>{value.toLocaleString()}</div>
        </div>
    )
}

const cardStyle: React.CSSProperties = {
    background: '#fff', borderRadius: 16, padding: 20,
    border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}
const cardTitleStyle: React.CSSProperties = {
    fontSize: 14, fontWeight: 700, color: '#64748b', margin: '0 0 12px',
}
const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '12px 14px', fontWeight: 700, color: '#475569', fontSize: 12,
}
const tdStyle: React.CSSProperties = {
    padding: '12px 14px', color: '#1e293b',
}
