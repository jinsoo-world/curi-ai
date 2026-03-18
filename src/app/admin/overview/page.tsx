'use client'

import { useEffect, useState } from 'react'

interface OverviewData {
    overview: {
        totalUsers: number
        newUsersToday: number
        newUsersYesterday: number
        newUsersThisWeek: number
        totalSessions: number
        totalMessages: number
        todayMessages: number
        wau: number
        lastWau: number
        weeklyGrowth: string
        userGrowth: string
        avgMessagesPerSession: string
        activeSubscriptions: number
    }
    signupTrend: Array<{ date: string; count: number }>
    hourlyDistribution: number[]
    authProviders: Record<string, number>
    signalCounts: Record<string, number>
}

// ========================================
// 재사용 컴포넌트
// ========================================

function StatCard({ label, value, sub, color, trend, icon }: {
    label: string
    value: string | number
    sub?: string
    color: string
    trend?: string | null
    icon?: string
}) {
    const isPositive = trend && !trend.startsWith('-') && trend !== '—'
    const trendColor = trend === '—' ? '#94a3b8' : isPositive ? '#16a34a' : '#dc2626'

    return (
        <div style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            padding: '20px 24px',
            flex: '1 1 200px',
            minWidth: 170,
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
            {icon && (
                <div style={{
                    position: 'absolute',
                    top: 12,
                    right: 16,
                    fontSize: 28,
                    opacity: 0.15,
                }}>{icon}</div>
            )}
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, fontWeight: 600, letterSpacing: 0.3 }}>
                {label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                {trend && trend !== '—' && (
                    <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: trendColor,
                        background: isPositive ? '#dcfce7' : '#fee2e2',
                        padding: '2px 6px',
                        borderRadius: 6,
                    }}>
                        {isPositive ? '↑' : '↓'} {trend}%
                    </span>
                )}
                {sub && <span style={{ fontSize: 11, color: '#94a3b8' }}>{sub}</span>}
            </div>
        </div>
    )
}

function AreaChart({ data, dataKey, color, height = 120 }: {
    data: Array<Record<string, unknown>>
    dataKey: string
    color: string
    height?: number
}) {
    if (!data.length) return <div style={{ color: '#94a3b8', fontSize: 13, padding: 20 }}>데이터 없음</div>
    const values = data.map(d => Number(d[dataKey]) || 0)
    const max = Math.max(...values, 1)
    const width = 500
    const stepX = width / Math.max(values.length - 1, 1)
    const points = values.map((v, i) => `${i * stepX},${height - (v / max) * (height - 20) - 10}`).join(' ')
    const areaPoints = `0,${height} ${points} ${(values.length - 1) * stepX},${height}`

    return (
        <div>
            <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height }} preserveAspectRatio="none">
                <defs>
                    <linearGradient id={`grad-${dataKey}-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <polygon points={areaPoints} fill={`url(#grad-${dataKey}-${color.replace('#', '')})`} />
                <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {values.map((v, i) => (
                    <circle key={i} cx={i * stepX} cy={height - (v / max) * (height - 20) - 10} r="3" fill={color} stroke="#fff" strokeWidth="1.5" />
                ))}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, padding: '0 2px' }}>
                {data.length > 1 && [0, Math.floor(data.length / 2), data.length - 1].map(i => (
                    <span key={i} style={{ fontSize: 10, color: '#94a3b8' }}>
                        {String(data[i]?.date || '').slice(5)}
                    </span>
                ))}
            </div>
        </div>
    )
}

function BarChart({ data, height = 120, color }: {
    data: number[]
    height?: number
    color: string
}) {
    const max = Math.max(...data, 1)
    const width = 500
    const barW = width / data.length - 2

    return (
        <svg viewBox={`0 0 ${width} ${height + 20}`} style={{ width: '100%', height: height + 20 }}>
            {data.map((v, i) => {
                const barH = (v / max) * height
                const x = i * (width / data.length) + 1
                return (
                    <g key={i}>
                        <rect x={x} y={height - barH} width={barW} height={barH} rx={3} fill={color} opacity={v > 0 ? 0.7 : 0.1} />
                        {i % 3 === 0 && (
                            <text x={x + barW / 2} y={height + 14} textAnchor="middle" fill="#94a3b8" fontSize="9">
                                {i}시
                            </text>
                        )}
                    </g>
                )
            })}
        </svg>
    )
}

function DonutChart({ data, colors }: {
    data: Array<{ label: string; value: number }>
    colors: string[]
}) {
    const total = data.reduce((s, d) => s + d.value, 0) || 1
    const r = 40
    const circumference = 2 * Math.PI * r
    let offset = 0

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <svg width="100" height="100" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
                {data.map((d, i) => {
                    const pct = d.value / total
                    const dashLength = pct * circumference
                    const el = (
                        <circle
                            key={i}
                            cx="50" cy="50" r={r} fill="none"
                            stroke={colors[i % colors.length]}
                            strokeWidth="12"
                            strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                            strokeDashoffset={-offset - circumference / 4}
                            strokeLinecap="round"
                        />
                    )
                    offset += dashLength
                    return el
                })}
                <text x="50" y="50" textAnchor="middle" dominantBaseline="central" fill="#1e293b" fontSize="14" fontWeight="700">
                    {total.toLocaleString()}
                </text>
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {data.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[i % colors.length], flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                            {d.label} <b style={{ color: '#1e293b' }}>{d.value.toLocaleString()}</b>
                            <span style={{ color: '#94a3b8', marginLeft: 4 }}>
                                ({((d.value / total) * 100).toFixed(0)}%)
                            </span>
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            padding: 24,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 16px', color: '#64748b', letterSpacing: 0.3 }}>
                {title}
            </h3>
            {children}
        </div>
    )
}

// 대화 품질 신호 카드
const SIGNAL_META: Record<string, { emoji: string; label: string; desc: string; color: string }> = {
    long_session: { emoji: '💚', label: '긴 대화', desc: '10턴 이상 (만족 신호)', color: '#16a34a' },
    re_question: { emoji: '🔄', label: '재질문', desc: 'AI 답변 부족 의심', color: '#f59e0b' },
    early_exit: { emoji: '🚪', label: '조기 이탈', desc: '1~2턴 후 나감', color: '#ef4444' },
    negative_feedback: { emoji: '👎', label: '부정 피드백', desc: '유저 불만족', color: '#dc2626' },
    topic_gap: { emoji: '❓', label: '지식 갭', desc: 'AI가 모르는 질문', color: '#8b5cf6' },
}

function SignalSummary({ signals }: { signals: Record<string, number> }) {
    const total = Object.values(signals).reduce((s, v) => s + v, 0)

    if (total === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
                <div style={{ color: '#94a3b8', fontSize: 13 }}>최근 7일 수집된 신호 없음</div>
                <div style={{ color: '#cbd5e1', fontSize: 11, marginTop: 4 }}>대화가 더 쌓이면 자동 감지됩니다</div>
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(SIGNAL_META).map(([key, meta]) => {
                const count = signals[key] || 0
                const pct = total > 0 ? (count / total) * 100 : 0
                return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{meta.emoji}</span>
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{meta.label}</span>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>{count}건</span>
                            </div>
                            <div style={{ height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    width: `${Math.max(pct, 2)}%`,
                                    background: meta.color,
                                    borderRadius: 3,
                                    transition: 'width 0.5s ease',
                                }} />
                            </div>
                        </div>
                    </div>
                )
            })}
            <div style={{ textAlign: 'right', fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                최근 7일 · 총 {total}건
            </div>
        </div>
    )
}

// ========================================
// 메인 페이지
// ========================================

export default function OverviewPage() {
    const [data, setData] = useState<OverviewData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

    const fetchData = () => {
        setLoading(true)
        fetch('/api/admin/metrics')
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`)
                return r.json()
            })
            .then(d => { setData(d); setLastRefresh(new Date()) })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }

    useEffect(() => { fetchData() }, [])

    // 5분마다 자동 갱신
    useEffect(() => {
        const interval = setInterval(fetchData, 5 * 60 * 1000)
        return () => clearInterval(interval)
    }, [])

    if (loading && !data) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
                }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: '50%',
                        border: '3px solid #e0e7ff',
                        borderTopColor: '#6366f1',
                        animation: 'spin 1s linear infinite',
                    }} />
                    <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                    <span style={{ color: '#64748b', fontSize: 14 }}>대시보드 데이터 로딩 중...</span>
                </div>
            </div>
        )
    }

    if (error && !data) {
        return (
            <div style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                <h2 style={{ color: '#dc2626', margin: '0 0 8px' }}>데이터 로딩 실패</h2>
                <p style={{ color: '#94a3b8', margin: '0 0 16px' }}>{error}</p>
                <button onClick={fetchData} style={{
                    padding: '10px 24px', borderRadius: 12, border: 'none',
                    background: '#6366f1', color: '#fff', fontSize: 14, cursor: 'pointer',
                }}>
                    다시 시도
                </button>
            </div>
        )
    }

    if (!data) return null

    const o = data.overview

    // 가입 경로 도넛
    const authDonut = Object.entries(data.authProviders).map(([k, v]) => ({
        label: k === 'google' ? 'Google' : k === 'kakao' ? '카카오' : k === 'anonymous' ? '게스트' : k,
        value: v,
    }))
    const authColors = ['#60a5fa', '#fbbf24', '#a78bfa', '#34d399', '#f472b6']

    return (
        <div>
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: -0.5, color: '#1e293b' }}>
                        📊 대시보드
                    </h1>
                    <p style={{ color: '#94a3b8', fontSize: 13, margin: '6px 0 0' }}>
                        {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                        마지막 갱신: {lastRefresh.toLocaleTimeString('ko-KR')}
                    </span>
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        style={{
                            padding: '8px 16px', borderRadius: 10,
                            border: '1px solid #e5e7eb',
                            background: '#fff',
                            color: '#1e293b', fontSize: 13, cursor: 'pointer',
                            opacity: loading ? 0.5 : 1,
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        }}
                    >
                        🔄 새로고침
                    </button>
                </div>
            </div>

            {/* === 핵심 지표 6개 === */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))', gap: 12, marginBottom: 28 }}>
                <StatCard icon="👥" label="총 유저" value={o.totalUsers} color="#3b82f6" trend={o.userGrowth} sub="vs 지난주" />
                <StatCard icon="🆕" label="오늘 신규 가입" value={o.newUsersToday} color="#16a34a" sub={`어제: ${o.newUsersYesterday}`} />
                <StatCard icon="📱" label="WAU" value={o.wau} color="#7c3aed" trend={o.weeklyGrowth} sub="주간 활성 유저" />
                <StatCard icon="📝" label="총 메시지" value={o.totalMessages} color="#db2777" sub={`오늘: ${o.todayMessages.toLocaleString()}`} />
                <StatCard icon="⚡" label="세션당 평균" value={`${o.avgMessagesPerSession}회`} color="#ea580c" sub="메시지" />
                <StatCard icon="💎" label="구독 유저" value={o.activeSubscriptions} color="#7c3aed" sub="프리미엄" />
            </div>

            {/* === 차트 2열 × 2행 === */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <ChartCard title="🆕 일별 신규 가입 추이 (30일)">
                    <AreaChart data={data.signupTrend} dataKey="count" color="#16a34a" height={130} />
                </ChartCard>
                <ChartCard title="🕐 시간대별 메시지 분포 (이번 주)">
                    <BarChart data={data.hourlyDistribution} color="#d97706" height={130} />
                </ChartCard>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <ChartCard title="🔐 가입 경로 분포">
                    {authDonut.length > 0 ?
                        <DonutChart data={authDonut} colors={authColors} /> :
                        <div style={{ color: '#94a3b8', fontSize: 13 }}>데이터 없음</div>
                    }
                </ChartCard>
                <ChartCard title="🚨 대화 품질 신호 (최근 7일)">
                    <SignalSummary signals={data.signalCounts} />
                </ChartCard>
            </div>
        </div>
    )
}
