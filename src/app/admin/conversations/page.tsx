'use client'

import { useEffect, useState, useCallback } from 'react'

interface ConversationData {
    dailyStats: Array<{
        date: string
        total_sessions: number
        total_messages: number
        user_messages: number
        assistant_messages: number
        stt_messages: number
        active_users: number
    }>
    recentSessions: Array<{
        id: string
        mentor_name: string
        user_name: string
        user_email: string
        message_count: number
        created_at: string
        last_message_at: string
        input_method: string
    }>
    inputRatio: {
        text: number
        stt: number
        voice_call: number
    }
}

export default function ConversationsPage() {
    const [data, setData] = useState<ConversationData | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [tab, setTab] = useState<'overview' | 'sessions'>('overview')

    const fetchData = useCallback(() => {
        setLoading(true)
        fetch('/api/admin/conversations')
            .then(r => r.json())
            .then(d => setData(d))
            .catch(e => console.error(e))
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => { fetchData() }, [fetchData])

    const handleRefreshViews = useCallback(async () => {
        setRefreshing(true)
        try {
            await fetch('/api/admin/refresh-views', { method: 'POST' })
            await fetchData()
        } catch (e) {
            console.error('MV refresh error:', e)
        } finally {
            setRefreshing(false)
        }
    }, [fetchData])

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    border: '3px solid #ede9fe',
                    borderTopColor: '#a855f7',
                    animation: 'spin 1s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
        )
    }

    if (!data) return null

    const stats = data.dailyStats || []
    const recent = data.recentSessions || []

    // 요약 수치
    const totalMsgsWeek = stats.reduce((s, d) => s + (d.total_messages || 0), 0)
    const totalSessionsWeek = stats.reduce((s, d) => s + (d.total_sessions || 0), 0)
    const avgMsgPerSession = totalSessionsWeek ? (totalMsgsWeek / totalSessionsWeek).toFixed(1) : '0'
    const voiceCallCount = data.inputRatio?.voice_call || 0
    const sttCount = data.inputRatio?.stt || 0
    const totalVoice = voiceCallCount + sttCount

    const formatRelative = (d: string) => {
        if (!d) return '—'
        const diffH = Math.floor((Date.now() - new Date(d).getTime()) / 3600000)
        if (diffH < 1) return '방금'
        if (diffH < 24) return `${diffH}h`
        if (diffH < 48) return '어제'
        return `${Math.floor(diffH / 24)}일 전`
    }

    // 차트 데이터
    const chartMax = Math.max(...stats.map(d => d.total_messages || 0), 1)
    const barWidth = 500
    const barH = 140

    return (
        <div>
            {/* 헤더 */}
            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#1e293b' }}>💬 대화 분석</h1>
                    <p style={{ color: '#94a3b8', fontSize: 13, margin: '6px 0 0' }}>
                        세션 · 메시지 · 입력방식 분석
                    </p>
                </div>
                <button
                    onClick={handleRefreshViews}
                    disabled={refreshing}
                    style={{
                        padding: '8px 16px', borderRadius: 10,
                        border: '1px solid #e5e7eb',
                        background: refreshing ? '#f1f5f9' : '#fff',
                        color: refreshing ? '#94a3b8' : '#4f46e5',
                        fontSize: 13, fontWeight: 600, cursor: refreshing ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        transition: 'all 0.2s',
                    }}
                >
                    {refreshing ? '⚙️ 갱신 중...' : '🔄 데이터 새로고침'}
                </button>
            </div>

            {/* 탭 */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: '#fff', borderRadius: 12, padding: 4, border: '1px solid #e5e7eb' }}>
                {[
                    { key: 'overview' as const, label: '📊 차트 분석' },
                    { key: 'sessions' as const, label: '📋 최근 세션' },
                ].map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        style={{
                            flex: 1, padding: '10px 0', borderRadius: 10,
                            border: 'none',
                            background: tab === t.key ? '#f0f0ff' : 'transparent',
                            color: tab === t.key ? '#6366f1' : '#94a3b8',
                            fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        }}
                    >{t.label}</button>
                ))}
            </div>

            {tab === 'overview' ? (
                <>
                    {/* 요약 카드 */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                        {[
                            { label: '주간 세션', value: totalSessionsWeek, icon: '📱', color: '#3b82f6' },
                            { label: '주간 메시지', value: totalMsgsWeek, icon: '💬', color: '#7c3aed' },
                            { label: '세션당 평균', value: avgMsgPerSession, icon: '📊', color: '#d97706' },
                            { label: '전화 콜 수', value: `${voiceCallCount}건`, icon: '📞', color: '#16a34a' },
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
                                    {typeof c.value === 'number' ? c.value.toLocaleString() : c.value}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 일별 메시지 추이 */}
                    <div style={{
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 16, padding: 24, marginBottom: 16,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: '#64748b' }}>
                            📈 일별 메시지 추이
                        </h3>
                        {stats.length > 0 ? (
                            <div>
                                <svg viewBox={`0 0 ${barWidth} ${barH + 24}`} style={{ width: '100%', height: barH + 24 }}>
                                    {/* 그리드 라인 */}
                                    {[0.25, 0.5, 0.75, 1].map((pct, i) => (
                                        <g key={i}>
                                            <line x1="0" y1={barH - pct * barH} x2={barWidth} y2={barH - pct * barH}
                                                stroke="#f1f5f9" strokeDasharray="4" />
                                            <text x="2" y={barH - pct * barH - 3} fill="#cbd5e1" fontSize="8">
                                                {Math.round(chartMax * pct)}
                                            </text>
                                        </g>
                                    ))}

                                    {stats.map((d, i) => {
                                        const w = barWidth / stats.length - 4
                                        const x = i * (barWidth / stats.length) + 2
                                        const userH = ((d.user_messages || 0) / chartMax) * barH
                                        const assistH = ((d.assistant_messages || 0) / chartMax) * barH
                                        return (
                                            <g key={i}>
                                                <rect x={x} y={barH - userH - assistH} width={w / 2 - 1} height={assistH} rx={3}
                                                    fill="#6366f1" opacity={0.7} />
                                                <rect x={x + w / 2} y={barH - userH} width={w / 2 - 1} height={userH} rx={3}
                                                    fill="#a78bfa" opacity={0.8} />
                                                {i % 3 === 0 && (
                                                    <text x={x + w / 2} y={barH + 14} textAnchor="middle" fill="#94a3b8" fontSize="9">
                                                        {d.date.slice(5)}
                                                    </text>
                                                )}
                                            </g>
                                        )
                                    })}
                                </svg>
                                <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
                                        <span style={{ width: 10, height: 10, borderRadius: 3, background: '#a78bfa' }} /> 유저 메시지
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748b' }}>
                                        <span style={{ width: 10, height: 10, borderRadius: 3, background: '#6366f1' }} /> AI 응답
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>데이터 없음</div>
                        )}
                    </div>

                    {/* 입력방식 + 일별 세션 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div style={{
                            background: '#fff',
                            border: '1px solid #e5e7eb',
                            borderRadius: 16, padding: 24,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        }}>
                            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: '#64748b' }}>
                                🎤 입력 방식 비율
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                                <svg width="100" height="100" viewBox="0 0 100 100">
                                    {(() => {
                                        const total = (data.inputRatio?.text || 0) + (data.inputRatio?.stt || 0) || 1
                                        const textPct = (data.inputRatio?.text || 0) / total
                                        const r = 40
                                        const c = 2 * Math.PI * r
                                        return (
                                            <>
                                                <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
                                                <circle cx="50" cy="50" r={r} fill="none" stroke="#3b82f6" strokeWidth="12"
                                                    strokeDasharray={`${textPct * c} ${(1 - textPct) * c}`}
                                                    strokeDashoffset={-c / 4} strokeLinecap="round" />
                                                <circle cx="50" cy="50" r={r} fill="none" stroke="#16a34a" strokeWidth="12"
                                                    strokeDasharray={`${(1 - textPct) * c} ${textPct * c}`}
                                                    strokeDashoffset={-c / 4 - textPct * c} strokeLinecap="round" />
                                            </>
                                        )
                                    })()}
                                </svg>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} />
                                        <span style={{ fontSize: 13, color: '#64748b' }}>
                                            ✏️ 텍스트 <b style={{ color: '#1e293b' }}>{data.inputRatio?.text?.toLocaleString() || 0}</b>
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />
                                        <span style={{ fontSize: 13, color: '#64748b' }}>
                                            🎤 음성입력 <b style={{ color: '#1e293b' }}>{data.inputRatio?.stt?.toLocaleString() || 0}</b>
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316' }} />
                                        <span style={{ fontSize: 13, color: '#64748b' }}>
                                            📞 음성통화 <b style={{ color: '#1e293b' }}>{data.inputRatio?.voice_call?.toLocaleString() || 0}</b>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{
                            background: '#fff',
                            border: '1px solid #e5e7eb',
                            borderRadius: 16, padding: 24,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        }}>
                            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: '#64748b' }}>
                                📅 일별 활성 유저
                            </h3>
                            {stats.length > 0 ? (
                                <svg viewBox={`0 0 ${barWidth} 110`} style={{ width: '100%', height: 110 }}>
                                    {(() => {
                                        const auMax = Math.max(...stats.map(d => d.active_users || 0), 1)
                                        const pts = stats.map((d, i) => {
                                            const x = (i / Math.max(stats.length - 1, 1)) * barWidth
                                            const y = 100 - ((d.active_users || 0) / auMax) * 90 - 5
                                            return `${x},${y}`
                                        }).join(' ')
                                        return (
                                            <>
                                                <defs>
                                                    <linearGradient id="auGrad" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="0%" stopColor="#d97706" stopOpacity="0.2" />
                                                        <stop offset="100%" stopColor="#d97706" stopOpacity="0" />
                                                    </linearGradient>
                                                </defs>
                                                <polygon points={`0,100 ${pts} ${barWidth},100`} fill="url(#auGrad)" />
                                                <polyline points={pts} fill="none" stroke="#d97706" strokeWidth="2" strokeLinejoin="round" />
                                            </>
                                        )
                                    })()}
                                </svg>
                            ) : (
                                <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>데이터 없음</div>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                /* 최근 세션 테이블 */
                <div style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 16, overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
                                {['유저', '멘토', '메시지', '입력방식', '시작', '마지막'].map(h => (
                                    <th key={h} style={{
                                        padding: '12px 16px', textAlign: 'left', fontSize: 11,
                                        fontWeight: 700, color: '#64748b',
                                        letterSpacing: 0.5, textTransform: 'uppercase',
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {recent.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>세션 없음</td></tr>
                            ) : recent.map((s, i) => (
                                <tr key={s.id} style={{
                                    borderBottom: '1px solid #f1f5f9',
                                    background: i % 2 === 0 ? '#fff' : '#fafbfc',
                                }}>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{s.user_name || '게스트'}</div>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.user_email || '—'}</div>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{
                                            fontSize: 12, fontWeight: 600, color: '#6366f1',
                                            background: '#f0f0ff', padding: '3px 10px', borderRadius: 8,
                                        }}>{s.mentor_name}</span>
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#1e293b' }}>
                                        {s.message_count}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: 12 }}>
                                        {s.input_method === 'stt' ?
                                            <span style={{ color: '#16a34a' }}>🎤 음성</span> :
                                            <span style={{ color: '#3b82f6' }}>⌨️ 텍스트</span>
                                        }
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>
                                        {formatRelative(s.created_at)}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>
                                        {formatRelative(s.last_message_at)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
