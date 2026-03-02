'use client'

import { useEffect, useState } from 'react'

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
    }
}

export default function ConversationsPage() {
    const [data, setData] = useState<ConversationData | null>(null)
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<'overview' | 'sessions'>('overview')

    useEffect(() => {
        fetch('/api/admin/conversations')
            .then(r => r.json())
            .then(d => setData(d))
            .catch(e => console.error(e))
            .finally(() => setLoading(false))
    }, [])

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    border: '3px solid rgba(168,85,247,0.3)',
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
    const sttRatio = data.inputRatio ? (
        (data.inputRatio.stt / Math.max(data.inputRatio.stt + data.inputRatio.text, 1)) * 100
    ).toFixed(0) : '0'

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
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>💬 대화 분석</h1>
                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: '6px 0 0' }}>
                    세션 · 메시지 · 입력방식 분석
                </p>
            </div>

            {/* 탭 */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 4 }}>
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
                            background: tab === t.key ? 'rgba(168,85,247,0.15)' : 'transparent',
                            color: tab === t.key ? '#a855f7' : 'rgba(255,255,255,0.4)',
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
                            { label: '주간 세션', value: totalSessionsWeek, icon: '📱', color: '#60a5fa' },
                            { label: '주간 메시지', value: totalMsgsWeek, icon: '💬', color: '#a78bfa' },
                            { label: '세션당 평균', value: avgMsgPerSession, icon: '📊', color: '#f59e0b' },
                            { label: 'STT 사용률', value: `${sttRatio}%`, icon: '🎤', color: '#34d399' },
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
                                    {typeof c.value === 'number' ? c.value.toLocaleString() : c.value}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 일별 메시지 추이 */}
                    <div style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 16, padding: 24, marginBottom: 16,
                    }}>
                        <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: 'rgba(255,255,255,0.6)' }}>
                            📈 일별 메시지 추이
                        </h3>
                        {stats.length > 0 ? (
                            <div>
                                <svg viewBox={`0 0 ${barWidth} ${barH + 24}`} style={{ width: '100%', height: barH + 24 }}>
                                    {/* 그리드 라인 */}
                                    {[0.25, 0.5, 0.75, 1].map((pct, i) => (
                                        <g key={i}>
                                            <line x1="0" y1={barH - pct * barH} x2={barWidth} y2={barH - pct * barH}
                                                stroke="rgba(255,255,255,0.04)" strokeDasharray="4" />
                                            <text x="2" y={barH - pct * barH - 3} fill="rgba(255,255,255,0.15)" fontSize="8">
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
                                                    fill="#6366f1" opacity={0.6} />
                                                <rect x={x + w / 2} y={barH - userH} width={w / 2 - 1} height={userH} rx={3}
                                                    fill="#a78bfa" opacity={0.8} />
                                                {i % 3 === 0 && (
                                                    <text x={x + w / 2} y={barH + 14} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="9">
                                                        {d.date.slice(5)}
                                                    </text>
                                                )}
                                            </g>
                                        )
                                    })}
                                </svg>
                                <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                                        <span style={{ width: 10, height: 10, borderRadius: 3, background: '#a78bfa' }} /> 유저 메시지
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                                        <span style={{ width: 10, height: 10, borderRadius: 3, background: '#6366f1' }} /> AI 응답
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: 30, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>데이터 없음</div>
                        )}
                    </div>

                    {/* 입력방식 + 일별 세션 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div style={{
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 16, padding: 24,
                        }}>
                            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: 'rgba(255,255,255,0.6)' }}>
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
                                                <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="12" />
                                                <circle cx="50" cy="50" r={r} fill="none" stroke="#60a5fa" strokeWidth="12"
                                                    strokeDasharray={`${textPct * c} ${(1 - textPct) * c}`}
                                                    strokeDashoffset={-c / 4} strokeLinecap="round" />
                                                <circle cx="50" cy="50" r={r} fill="none" stroke="#34d399" strokeWidth="12"
                                                    strokeDasharray={`${(1 - textPct) * c} ${textPct * c}`}
                                                    strokeDashoffset={-c / 4 - textPct * c} strokeLinecap="round" />
                                            </>
                                        )
                                    })()}
                                </svg>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#60a5fa' }} />
                                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                                            텍스트 <b style={{ color: '#fff' }}>{data.inputRatio?.text?.toLocaleString() || 0}</b>
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399' }} />
                                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                                            음성(STT) <b style={{ color: '#fff' }}>{data.inputRatio?.stt?.toLocaleString() || 0}</b>
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 16, padding: 24,
                        }}>
                            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: 'rgba(255,255,255,0.6)' }}>
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
                                                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.2" />
                                                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                                                    </linearGradient>
                                                </defs>
                                                <polygon points={`0,100 ${pts} ${barWidth},100`} fill="url(#auGrad)" />
                                                <polyline points={pts} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="round" />
                                            </>
                                        )
                                    })()}
                                </svg>
                            ) : (
                                <div style={{ padding: 30, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>데이터 없음</div>
                            )}
                        </div>
                    </div>
                </>
            ) : (
                /* 최근 세션 테이블 */
                <div style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 16, overflow: 'hidden',
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                {['유저', '멘토', '메시지', '입력방식', '시작', '마지막'].map(h => (
                                    <th key={h} style={{
                                        padding: '12px 16px', textAlign: 'left', fontSize: 11,
                                        fontWeight: 700, color: 'rgba(255,255,255,0.35)',
                                        letterSpacing: 0.5, textTransform: 'uppercase',
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {recent.length === 0 ? (
                                <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>세션 없음</td></tr>
                            ) : recent.map((s, i) => (
                                <tr key={s.id} style={{
                                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                }}>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.user_name || '게스트'}</div>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{s.user_email || '—'}</div>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{
                                            fontSize: 12, fontWeight: 600, color: '#a78bfa',
                                            background: 'rgba(167,139,250,0.1)', padding: '3px 10px', borderRadius: 8,
                                        }}>{s.mentor_name}</span>
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                        {s.message_count}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: 12 }}>
                                        {s.input_method === 'stt' ?
                                            <span style={{ color: '#34d399' }}>🎤 음성</span> :
                                            <span style={{ color: '#60a5fa' }}>⌨️ 텍스트</span>
                                        }
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                                        {formatRelative(s.created_at)}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
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
