'use client'

import { useEffect, useState, useCallback } from 'react'

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
        guestSessions: number
        todayMentors: number
        totalMentors: number
    }
    signupTrend: Array<{ date: string; count: number }>
    hourlyDistribution: number[]
    authProviders: Record<string, number>
    signalCounts: Record<string, number>
    insights: Array<{ emoji: string; text: string }>
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
            minWidth: 150,
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

function AreaChartWithTooltip({ data, dataKey, color, height = 130, unit = '' }: {
    data: Array<Record<string, unknown>>
    dataKey: string
    color: string
    height?: number
    unit?: string
}) {
    const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null)

    if (!data.length) return <div style={{ color: '#94a3b8', fontSize: 13, padding: 20 }}>데이터 없음</div>

    const values = data.map(d => Number(d[dataKey]) || 0)
    const max = Math.max(...values, 1)
    const width = 500
    const padLeft = 35
    const chartW = width - padLeft
    const stepX = chartW / Math.max(values.length - 1, 1)
    const yTicks = [0, Math.round(max / 2), max]

    const getY = (v: number) => height - (v / max) * (height - 20) - 10
    const points = values.map((v, i) => `${padLeft + i * stepX},${getY(v)}`).join(' ')
    const areaPoints = `${padLeft},${height} ${points} ${padLeft + (values.length - 1) * stepX},${height}`

    // 오늘 날짜
    const todayStr = new Date().toISOString().split('T')[0]
    const lastDateInData = String(data[data.length - 1]?.date || '')

    return (
        <div style={{ position: 'relative' }}>
            <svg
                viewBox={`0 0 ${width} ${height + 25}`}
                style={{ width: '100%', height: height + 25 }}
                preserveAspectRatio="none"
                onMouseLeave={() => setHover(null)}
            >
                <defs>
                    <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.15" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>

                {/* Y축 눈금 + 격자 */}
                {yTicks.map(tick => {
                    const y = getY(tick)
                    return (
                        <g key={tick}>
                            <line x1={padLeft} y1={y} x2={width} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                            <text x={padLeft - 5} y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="9">
                                {tick}{unit}
                            </text>
                        </g>
                    )
                })}

                {/* 영역 + 선 */}
                <polygon points={areaPoints} fill={`url(#grad-${dataKey})`} />
                <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

                {/* 점 + 호버 영역 */}
                {values.map((v, i) => {
                    const cx = padLeft + i * stepX
                    const cy = getY(v)
                    const isHovered = hover?.idx === i
                    return (
                        <g key={i}>
                            <rect
                                x={cx - stepX / 2}
                                y={0}
                                width={stepX}
                                height={height}
                                fill="transparent"
                                onMouseEnter={(e) => {
                                    const rect = (e.target as SVGRectElement).closest('svg')?.getBoundingClientRect()
                                    if (rect) setHover({ idx: i, x: (cx / width) * rect.width, y: (cy / (height + 25)) * rect.height })
                                }}
                            />
                            <circle cx={cx} cy={cy} r={isHovered ? 5 : 3} fill={isHovered ? '#fff' : color} stroke={color} strokeWidth={isHovered ? 3 : 1.5} />
                        </g>
                    )
                })}

                {/* X축 레이블 */}
                {data.length > 1 && [0, Math.floor(data.length / 2), data.length - 1].map(i => (
                    <text key={i} x={padLeft + i * stepX} y={height + 16} textAnchor="middle" fill="#94a3b8" fontSize="9">
                        {String(data[i]?.date || '').slice(5)}
                    </text>
                ))}

                {/* 오늘 표시 */}
                {lastDateInData === todayStr && (
                    <text x={padLeft + (values.length - 1) * stepX} y={height + 24} textAnchor="middle" fill={color} fontSize="8" fontWeight="700">
                        오늘
                    </text>
                )}
            </svg>

            {/* 툴팁 */}
            {hover !== null && (
                <div style={{
                    position: 'absolute',
                    left: hover.x - 40,
                    top: hover.y - 44,
                    background: '#1e293b',
                    color: '#fff',
                    padding: '6px 10px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 10,
                }}>
                    <div>{String(data[hover.idx]?.date || '').slice(5)}</div>
                    <div style={{ color: '#93c5fd' }}>{values[hover.idx]}{unit}</div>
                </div>
            )}
        </div>
    )
}

function BarChartWithTooltip({ data, height = 130, color }: {
    data: number[]
    height?: number
    color: string
}) {
    const [hoverIdx, setHoverIdx] = useState<number | null>(null)
    const max = Math.max(...data, 1)
    const width = 500
    const padLeft = 30
    const chartW = width - padLeft
    const barW = chartW / data.length - 2
    const yTicks = [0, Math.round(max / 2), max]

    const getY = (v: number) => height - (v / max) * height

    return (
        <div style={{ position: 'relative' }}>
            <svg
                viewBox={`0 0 ${width} ${height + 20}`}
                style={{ width: '100%', height: height + 20 }}
                onMouseLeave={() => setHoverIdx(null)}
            >
                {/* Y축 눈금 */}
                {yTicks.map(tick => {
                    const y = getY(tick)
                    return (
                        <g key={tick}>
                            <line x1={padLeft} y1={y} x2={width} y2={y} stroke="#f1f5f9" strokeWidth="1" />
                            <text x={padLeft - 5} y={y + 3} textAnchor="end" fill="#94a3b8" fontSize="9">
                                {tick}
                            </text>
                        </g>
                    )
                })}

                {data.map((v, i) => {
                    const barH = (v / max) * height
                    const x = padLeft + i * (chartW / data.length) + 1
                    const isHovered = hoverIdx === i
                    return (
                        <g key={i}
                            onMouseEnter={() => setHoverIdx(i)}
                        >
                            <rect x={x} y={getY(v)} width={barW} height={barH} rx={3}
                                fill={isHovered ? color : color}
                                opacity={v > 0 ? (isHovered ? 1 : 0.6) : 0.08}
                            />
                            {i % 3 === 0 && (
                                <text x={x + barW / 2} y={height + 14} textAnchor="middle" fill="#94a3b8" fontSize="9">
                                    {i}시
                                </text>
                            )}
                        </g>
                    )
                })}
            </svg>

            {/* 툴팁 */}
            {hoverIdx !== null && (
                <div style={{
                    position: 'absolute',
                    left: `${((padLeft + hoverIdx * (chartW / data.length) + barW / 2) / width) * 100}%`,
                    top: `${(getY(data[hoverIdx]) / (height + 20)) * 100 - 10}%`,
                    transform: 'translateX(-50%)',
                    background: '#1e293b',
                    color: '#fff',
                    padding: '5px 10px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 10,
                }}>
                    {hoverIdx}시: <span style={{ color: '#fbbf24' }}>{data[hoverIdx]}건</span>
                </div>
            )}
        </div>
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

// 대화 품질 신호
const SIGNAL_META: Record<string, { emoji: string; label: string; color: string }> = {
    long_session: { emoji: '💚', label: '긴 대화 (10턴+)', color: '#16a34a' },
    re_question: { emoji: '🔄', label: '재질문', color: '#f59e0b' },
    early_exit: { emoji: '🚪', label: '조기 이탈', color: '#ef4444' },
    negative_feedback: { emoji: '👎', label: '부정 피드백', color: '#dc2626' },
    topic_gap: { emoji: '❓', label: '지식 갭', color: '#8b5cf6' },
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

    const fetchData = useCallback(() => {
        setLoading(true)
        fetch('/api/admin/metrics')
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`)
                return r.json()
            })
            .then(d => { setData(d); setLastRefresh(new Date()) })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => { fetchData() }, [fetchData])

    useEffect(() => {
        const interval = setInterval(fetchData, 5 * 60 * 1000)
        return () => clearInterval(interval)
    }, [fetchData])

    if (loading && !data) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
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

    // 가입 경로: 카카오=노랑, 구글=파랑 순서 고정
    const providerOrder = ['kakao', 'google']
    const providerLabels: Record<string, string> = { kakao: '카카오', google: 'Google' }
    const providerColors: Record<string, string> = { kakao: '#FEE500', google: '#4285F4' }
    const otherColors = ['#a78bfa', '#34d399', '#f472b6']

    const sortedProviders = [
        ...providerOrder.filter(k => data.authProviders[k]),
        ...Object.keys(data.authProviders).filter(k => !providerOrder.includes(k)),
    ]

    const authDonut = sortedProviders.map(k => ({
        label: providerLabels[k] || k,
        value: data.authProviders[k],
    }))
    const authColors = sortedProviders.map((k, i) =>
        providerColors[k] || otherColors[i % otherColors.length]
    )

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

            {/* === 핵심 지표 8개 (2행) === */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
                <StatCard icon="👥" label="총 유저" value={o.totalUsers} color="#3b82f6" trend={o.userGrowth} sub="vs 지난주" />
                <StatCard icon="🆕" label="오늘 신규 가입" value={o.newUsersToday} color="#16a34a" sub={`어제: ${o.newUsersYesterday}`} />
                <StatCard icon="📱" label="WAU" value={o.wau} color="#7c3aed" trend={o.weeklyGrowth} sub="주간 활성" />
                <StatCard icon="📝" label="총 메시지" value={o.totalMessages} color="#db2777" sub={`오늘: ${o.todayMessages.toLocaleString()}`} />
                <StatCard icon="⚡" label="세션당 평균" value={`${o.avgMessagesPerSession}회`} color="#ea580c" sub="메시지" />
                <StatCard icon="💎" label="구독 유저" value={o.activeSubscriptions} color="#7c3aed" sub="프리미엄" />
                <StatCard icon="👻" label="비회원 대화" value={o.guestSessions} color="#64748b" sub="게스트 세션" />
                <StatCard icon="🤖" label="오늘 생성 AI" value={o.todayMentors} color="#059669" sub={`전체: ${o.totalMentors}`} />
            </div>

            {/* === 오늘의 인사이트 === */}
            <div style={{
                background: 'linear-gradient(135deg, #f0f9ff 0%, #faf5ff 100%)',
                border: '1px solid #e0e7ff',
                borderRadius: 16,
                padding: '20px 24px',
                marginBottom: 20,
            }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 12px', color: '#4f46e5' }}>
                    💡 오늘의 인사이트
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {data.insights.map((ins, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 16 }}>{ins.emoji}</span>
                            <span style={{ fontSize: 13, color: '#334155' }}>{ins.text}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* === 차트 2열 × 2행 === */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <ChartCard title="🆕 일별 신규 가입 추이 (30일)">
                    <AreaChartWithTooltip data={data.signupTrend} dataKey="count" color="#16a34a" height={130} unit="명" />
                </ChartCard>
                <ChartCard title="🕐 시간대별 메시지 분포 (이번 주)">
                    <BarChartWithTooltip data={data.hourlyDistribution} color="#d97706" height={130} />
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
