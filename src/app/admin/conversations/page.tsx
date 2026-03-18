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
    const [hoveredBar, setHoveredBar] = useState<number | null>(null)
    const [hoveredPoint, setHoveredPoint] = useState<number | null>(null)

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
    const textCount = data.inputRatio?.text || 0
    const sttCount = data.inputRatio?.stt || 0
    const totalInput = textCount + sttCount || 1
    const textPct = Math.round((textCount / totalInput) * 100)
    const sttPct = 100 - textPct

    const formatRelative = (d: string) => {
        if (!d) return '—'
        const diffH = Math.floor((Date.now() - new Date(d).getTime()) / 3600000)
        if (diffH < 1) return '방금'
        if (diffH < 24) return `${diffH}시간 전`
        if (diffH < 48) return '어제'
        return `${Math.floor(diffH / 24)}일 전`
    }

    // 차트 설정
    const chartW = 560
    const chartH = 140
    const chartPadL = 45  // Y축 라벨 공간
    const chartPadR = 10
    const chartPadT = 20
    const chartPadB = 35  // X축 라벨 공간
    const plotW = chartW - chartPadL - chartPadR
    const plotH = chartH - chartPadT - chartPadB

    const msgMax = Math.max(...stats.map(d => d.user_messages || 0), 1)
    // Y축 눈금을 깔끔하게
    const yStep = msgMax <= 20 ? 5 : msgMax <= 50 ? 10 : msgMax <= 100 ? 25 : msgMax <= 200 ? 50 : 100
    const yMax = Math.ceil(msgMax / yStep) * yStep
    const yTicks = Array.from({ length: Math.floor(yMax / yStep) + 1 }, (_, i) => i * yStep)

    // 활성 유저 차트
    const auMax = Math.max(...stats.map(d => d.active_users || 0), 1)
    const auStep = auMax <= 5 ? 1 : auMax <= 10 ? 2 : auMax <= 20 ? 5 : 10
    const auYMax = Math.ceil(auMax / auStep) * auStep
    const auYTicks = Array.from({ length: Math.floor(auYMax / auStep) + 1 }, (_, i) => i * auStep)

    return (
        <div>
            {/* 헤더 */}
            <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#1e293b' }}>💬 대화 분석</h1>
                    <p style={{ color: '#94a3b8', fontSize: 13, margin: '6px 0 0' }}>
                        최근 30일간 세션 · 메시지 · 사용자 트렌드
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
                            { label: '총 세션', value: totalSessionsWeek.toLocaleString(), sub: '최근 30일', color: '#3b82f6', icon: '📱' },
                            { label: '총 메시지', value: totalMsgsWeek.toLocaleString(), sub: '유저 + AI', color: '#7c3aed', icon: '💬' },
                            { label: '세션당 평균', value: `${avgMsgPerSession}건`, sub: '메시지 수', color: '#d97706', icon: '📊' },
                            { label: '음성 입력', value: `${sttCount}건`, sub: `전체의 ${sttPct}%`, color: '#16a34a', icon: '🎤' },
                        ].map((c, i) => (
                            <div key={i} style={{
                                background: '#fff',
                                border: '1px solid #e5e7eb',
                                borderRadius: 14, padding: '16px 20px',
                                position: 'relative', overflow: 'hidden',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            }}>
                                <span style={{ position: 'absolute', top: 12, right: 14, fontSize: 24, opacity: 0.12 }}>{c.icon}</span>
                                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 2 }}>{c.label}</div>
                                <div style={{ fontSize: 24, fontWeight: 800, color: c.color, fontVariantNumeric: 'tabular-nums' }}>
                                    {c.value}
                                </div>
                                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{c.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* ===== 일별 메시지 추이 ===== */}
                    <div style={{
                        background: '#fff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 16, padding: 24, marginBottom: 16,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', color: '#1e293b' }}>
                                📈 일별 유저 메시지 추이
                            </h3>
                        </div>
                        {stats.length > 0 ? (
                            <div style={{ position: 'relative' }}>
                                <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                                    {/* Y축 그리드 & 라벨 */}
                                    {yTicks.map(tick => {
                                        const y = chartPadT + plotH - (tick / yMax) * plotH
                                        return (
                                            <g key={tick}>
                                                <line x1={chartPadL} y1={y} x2={chartW - chartPadR} y2={y}
                                                    stroke="#f1f5f9" strokeWidth="1" />
                                                <text x={chartPadL - 8} y={y + 3} textAnchor="end"
                                                    fill="#94a3b8" fontSize="10" fontWeight="500">
                                                    {tick}
                                                </text>
                                            </g>
                                        )
                                    })}

                                    {/* Y축 레이블 */}
                                    <text x={12} y={chartPadT + plotH / 2}
                                        textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="600"
                                        transform={`rotate(-90, 12, ${chartPadT + plotH / 2})`}>
                                        메시지 수
                                    </text>

                                    {/* 바 차트 */}
                                    {stats.map((d, i) => {
                                        const groupW = plotW / stats.length
                                        const barW = Math.min(groupW * 0.6, 16)
                                        const cx = chartPadL + i * groupW + groupW / 2

                                        const userH = ((d.user_messages || 0) / yMax) * plotH

                                        const isHovered = hoveredBar === i

                                        return (
                                            <g key={i}
                                                onMouseEnter={() => setHoveredBar(i)}
                                                onMouseLeave={() => setHoveredBar(null)}
                                                style={{ cursor: 'pointer' }}>

                                                {/* 히트 영역 */}
                                                <rect x={cx - groupW / 2} y={chartPadT} width={groupW} height={plotH}
                                                    fill="transparent" />

                                                {/* 호버 배경 */}
                                                {isHovered && (
                                                    <rect x={cx - groupW / 2} y={chartPadT} width={groupW} height={plotH}
                                                        fill="#f8fafc" rx={4} />
                                                )}

                                                {/* 유저 메시지 바 */}
                                                <rect
                                                    x={cx - barW / 2}
                                                    y={chartPadT + plotH - userH}
                                                    width={barW}
                                                    height={Math.max(userH, 0)}
                                                    rx={3}
                                                    fill="#818cf8"
                                                    opacity={isHovered ? 1 : 0.8}
                                                />

                                                {/* X축 날짜 — 간격에 따라 표시 */}
                                                {(stats.length <= 14 || i % 2 === 0) && (
                                                    <text x={cx} y={chartH - 8} textAnchor="middle"
                                                        fill={isHovered ? '#6366f1' : '#94a3b8'}
                                                        fontSize="9" fontWeight={isHovered ? '700' : '400'}>
                                                        {d.date.slice(5)}
                                                    </text>
                                                )}

                                                {/* 호버 툴팁 */}
                                                {isHovered && (
                                                    <g>
                                                        <rect x={cx - 38} y={chartPadT - 18} width={76} height={16}
                                                            rx={4} fill="#1e293b" />
                                                        <text x={cx} y={chartPadT - 7} textAnchor="middle"
                                                            fill="#fff" fontSize="9" fontWeight="600">
                                                            {d.user_messages || 0}건 메시지
                                                        </text>
                                                    </g>
                                                )}
                                            </g>
                                        )
                                    })}

                                    {/* 축선 */}
                                    <line x1={chartPadL} y1={chartPadT + plotH} x2={chartW - chartPadR} y2={chartPadT + plotH}
                                        stroke="#e2e8f0" strokeWidth="1" />
                                    <line x1={chartPadL} y1={chartPadT} x2={chartPadL} y2={chartPadT + plotH}
                                        stroke="#e2e8f0" strokeWidth="1" />
                                </svg>
                            </div>
                        ) : (
                            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>데이터 없음</div>
                        )}
                    </div>

                    {/* ===== 하단: 입력방식 + 일별 활성유저 ===== */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 16 }}>
                        {/* 입력 방식 비율 */}
                        <div style={{
                            background: '#fff',
                            border: '1px solid #e5e7eb',
                            borderRadius: 16, padding: 24,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        }}>
                            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 20px', color: '#1e293b' }}>
                                ⌨️ 입력 방식
                            </h3>
                            {/* 프로그레스 바 형태 */}
                            <div style={{ marginBottom: 20 }}>
                                <div style={{
                                    height: 28, borderRadius: 14, overflow: 'hidden',
                                    display: 'flex', background: '#f1f5f9',
                                }}>
                                    {textCount > 0 && (
                                        <div style={{
                                            width: `${textPct}%`, background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: '#fff', fontSize: 11, fontWeight: 700, minWidth: 40,
                                            transition: 'width 0.5s ease',
                                        }}>
                                            {textPct}%
                                        </div>
                                    )}
                                    {sttCount > 0 && (
                                        <div style={{
                                            width: `${sttPct}%`, background: 'linear-gradient(135deg, #10b981, #34d399)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: '#fff', fontSize: 11, fontWeight: 700, minWidth: 40,
                                            transition: 'width 0.5s ease',
                                        }}>
                                            {sttPct}%
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* 항목 설명 */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: 8,
                                            background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 16,
                                        }}>⌨️</div>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>텍스트 입력</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>키보드로 직접 타이핑</div>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: '#6366f1' }}>{textCount.toLocaleString()}</div>
                                </div>
                                <div style={{ height: 1, background: '#f1f5f9' }} />
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: 8,
                                            background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 16,
                                        }}>🎤</div>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>음성 입력</div>
                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>말하면 텍스트로 변환 (STT)</div>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>{sttCount.toLocaleString()}</div>
                                </div>
                            </div>
                        </div>

                        {/* 일별 활성 유저 */}
                        <div style={{
                            background: '#fff',
                            border: '1px solid #e5e7eb',
                            borderRadius: 16, padding: 24,
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        }}>
                            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px', color: '#1e293b' }}>
                                👥 일별 활성 유저
                            </h3>
                            {stats.length > 0 ? (
                                <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
                                    {/* Y축 그리드 & 라벨 */}
                                    {auYTicks.map(tick => {
                                        const y = chartPadT + plotH - (tick / auYMax) * plotH
                                        return (
                                            <g key={tick}>
                                                <line x1={chartPadL} y1={y} x2={chartW - chartPadR} y2={y}
                                                    stroke="#f1f5f9" strokeWidth="1" />
                                                <text x={chartPadL - 8} y={y + 3} textAnchor="end"
                                                    fill="#94a3b8" fontSize="10" fontWeight="500">
                                                    {tick}
                                                </text>
                                            </g>
                                        )
                                    })}

                                    {/* Y축 레이블 */}
                                    <text x={12} y={chartPadT + plotH / 2}
                                        textAnchor="middle" fill="#94a3b8" fontSize="9" fontWeight="600"
                                        transform={`rotate(-90, 12, ${chartPadT + plotH / 2})`}>
                                        유저 수 (명)
                                    </text>

                                    {/* 영역 그라데이션 */}
                                    <defs>
                                        <linearGradient id="auGrad2" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
                                            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
                                        </linearGradient>
                                    </defs>

                                    {/* 영역 채우기 */}
                                    <polygon
                                        points={[
                                            `${chartPadL},${chartPadT + plotH}`,
                                            ...stats.map((d, i) => {
                                                const x = chartPadL + (i / Math.max(stats.length - 1, 1)) * plotW
                                                const y = chartPadT + plotH - ((d.active_users || 0) / auYMax) * plotH
                                                return `${x},${y}`
                                            }),
                                            `${chartPadL + plotW},${chartPadT + plotH}`,
                                        ].join(' ')}
                                        fill="url(#auGrad2)"
                                    />

                                    {/* 라인 */}
                                    <polyline
                                        points={stats.map((d, i) => {
                                            const x = chartPadL + (i / Math.max(stats.length - 1, 1)) * plotW
                                            const y = chartPadT + plotH - ((d.active_users || 0) / auYMax) * plotH
                                            return `${x},${y}`
                                        }).join(' ')}
                                        fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                                    />

                                    {/* 데이터 포인트 & X축 날짜 */}
                                    {stats.map((d, i) => {
                                        const x = chartPadL + (i / Math.max(stats.length - 1, 1)) * plotW
                                        const y = chartPadT + plotH - ((d.active_users || 0) / auYMax) * plotH
                                        const isHovered = hoveredPoint === i

                                        return (
                                            <g key={i}
                                                onMouseEnter={() => setHoveredPoint(i)}
                                                onMouseLeave={() => setHoveredPoint(null)}>
                                                {/* 히트 영역 */}
                                                <rect x={x - 15} y={chartPadT} width={30} height={plotH + chartPadB}
                                                    fill="transparent" style={{ cursor: 'pointer' }} />

                                                {/* 포인트 */}
                                                <circle cx={x} cy={y} r={isHovered ? 5 : 3}
                                                    fill="#f59e0b" stroke="#fff" strokeWidth="2" />

                                                {/* X축 날짜 */}
                                                {(stats.length <= 14 || i % 2 === 0) && (
                                                    <text x={x} y={chartH - 8} textAnchor="middle"
                                                        fill={isHovered ? '#f59e0b' : '#94a3b8'}
                                                        fontSize="9" fontWeight={isHovered ? '700' : '400'}>
                                                        {d.date.slice(5)}
                                                    </text>
                                                )}

                                                {/* 호버 툴팁 */}
                                                {isHovered && (
                                                    <g>
                                                        <rect x={x - 32} y={y - 24} width={64} height={18}
                                                            rx={4} fill="#1e293b" />
                                                        <text x={x} y={y - 12} textAnchor="middle"
                                                            fill="#fff" fontSize="10" fontWeight="600">
                                                            {d.active_users || 0}명
                                                        </text>
                                                    </g>
                                                )}
                                            </g>
                                        )
                                    })}

                                    {/* 축선 */}
                                    <line x1={chartPadL} y1={chartPadT + plotH} x2={chartW - chartPadR} y2={chartPadT + plotH}
                                        stroke="#e2e8f0" strokeWidth="1" />
                                    <line x1={chartPadL} y1={chartPadT} x2={chartPadL} y2={chartPadT + plotH}
                                        stroke="#e2e8f0" strokeWidth="1" />
                                </svg>
                            ) : (
                                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>데이터 없음</div>
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
