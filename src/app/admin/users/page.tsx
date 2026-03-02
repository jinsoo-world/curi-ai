'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface UserData {
    id: string
    email: string
    display_name: string
    created_at: string
    auth_provider: string
    segment?: string
    total_sessions?: number
    total_messages?: number
    last_active_at?: string
}

interface UsersResponse {
    users: UserData[]
    totalCount: number
    page: number
    pageSize: number
    segments: Record<string, number>
}

const SEGMENT_CONFIG: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
    all: { label: '전체', emoji: '👥', color: '#fff', bg: 'rgba(255,255,255,0.06)' },
    new: { label: '신규', emoji: '🆕', color: '#34d399', bg: 'rgba(52,211,153,0.12)' },
    light: { label: '라이트', emoji: '💡', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
    heavy: { label: '헤비', emoji: '🔥', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    dormant: { label: '휴면', emoji: '😴', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
    churned: { label: '이탈', emoji: '💔', color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
}

export default function UsersPage() {
    const router = useRouter()
    const [data, setData] = useState<UsersResponse | null>(null)
    const [loading, setLoading] = useState(true)
    const [segment, setSegment] = useState('all')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [sortBy, setSortBy] = useState('created_at')
    const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')

    const fetchUsers = useCallback(() => {
        setLoading(true)
        const params = new URLSearchParams({
            page: String(page),
            pageSize: '20',
            sort: sortBy,
            dir: sortDir,
            ...(segment !== 'all' && { segment }),
            ...(search && { search }),
        })
        fetch(`/api/admin/users?${params}`)
            .then(r => r.json())
            .then(d => setData(d))
            .catch(e => console.error(e))
            .finally(() => setLoading(false))
    }, [page, segment, search, sortBy, sortDir])

    useEffect(() => { fetchUsers() }, [fetchUsers])

    const totalPages = data ? Math.ceil(data.totalCount / 20) : 0

    const toggleSort = (col: string) => {
        if (sortBy === col) {
            setSortDir(d => d === 'desc' ? 'asc' : 'desc')
        } else {
            setSortBy(col)
            setSortDir('desc')
        }
        setPage(1)
    }

    const formatDate = (d: string) => {
        if (!d) return '—'
        const date = new Date(d)
        const now = new Date()
        const diffH = Math.floor((now.getTime() - date.getTime()) / 3600000)
        if (diffH < 1) return '방금 전'
        if (diffH < 24) return `${diffH}시간 전`
        if (diffH < 48) return '어제'
        return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    }

    const getSegmentBadge = (seg?: string) => {
        const cfg = SEGMENT_CONFIG[seg || ''] || { label: seg || '—', color: '#fff', bg: 'rgba(255,255,255,0.06)', emoji: '' }
        return (
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontWeight: 600, color: cfg.color,
                background: cfg.bg, padding: '3px 10px', borderRadius: 20,
            }}>
                {cfg.emoji} {cfg.label}
            </span>
        )
    }

    return (
        <div>
            {/* 헤더 */}
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>👥 유저 관리</h1>
                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, margin: '6px 0 0' }}>
                    전체 {data?.totalCount?.toLocaleString() || 0}명 · 세그먼트별 분석
                </p>
            </div>

            {/* 세그먼트 필터 바 */}
            <div style={{
                display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20,
                background: 'rgba(255,255,255,0.02)', borderRadius: 14, padding: 6,
                border: '1px solid rgba(255,255,255,0.04)',
            }}>
                {Object.entries(SEGMENT_CONFIG).map(([key, cfg]) => (
                    <button
                        key={key}
                        onClick={() => { setSegment(key); setPage(1) }}
                        style={{
                            padding: '8px 16px', borderRadius: 10,
                            border: segment === key ? `1px solid ${cfg.color}40` : '1px solid transparent',
                            background: segment === key ? cfg.bg : 'transparent',
                            color: segment === key ? cfg.color : 'rgba(255,255,255,0.4)',
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                    >
                        {cfg.emoji} {cfg.label}
                        {data?.segments && data.segments[key] !== undefined ?
                            ` (${data.segments[key]})` :
                            key === 'all' && data ? ` (${data.totalCount})` : ''
                        }
                    </button>
                ))}
            </div>

            {/* 검색 */}
            <div style={{ marginBottom: 20 }}>
                <input
                    type="text"
                    placeholder="🔍 이름 또는 이메일로 검색..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1) }}
                    style={{
                        width: '100%', maxWidth: 400, padding: '10px 16px',
                        borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.03)',
                        color: '#fff', fontSize: 14, outline: 'none',
                    }}
                />
            </div>

            {/* 유저 테이블 */}
            <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 16, overflow: 'hidden',
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            {[
                                { key: 'display_name', label: '유저' },
                                { key: 'segment', label: '세그먼트' },
                                { key: 'auth_provider', label: '가입경로' },
                                { key: 'total_sessions', label: '세션' },
                                { key: 'total_messages', label: '메시지' },
                                { key: 'last_active_at', label: '마지막 활동' },
                                { key: 'created_at', label: '가입일' },
                            ].map(col => (
                                <th
                                    key={col.key}
                                    onClick={() => toggleSort(col.key)}
                                    style={{
                                        padding: '12px 16px',
                                        textAlign: 'left', fontSize: 11, fontWeight: 700,
                                        color: sortBy === col.key ? '#60a5fa' : 'rgba(255,255,255,0.35)',
                                        cursor: 'pointer', userSelect: 'none',
                                        letterSpacing: 0.5, textTransform: 'uppercase',
                                    }}
                                >
                                    {col.label}
                                    {sortBy === col.key && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && !data ? (
                            <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>로딩 중...</td></tr>
                        ) : !data?.users?.length ? (
                            <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>유저 없음</td></tr>
                        ) : data.users.map((user, i) => (
                            <tr
                                key={user.id}
                                onClick={() => router.push(`/admin/users/${user.id}`)}
                                style={{
                                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                    transition: 'background 0.2s',
                                    cursor: 'pointer',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.06)')}
                                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')}
                            >
                                <td style={{ padding: '12px 16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: '50%',
                                            background: `hsl(${user.id.charCodeAt(0) * 7 % 360}, 50%, 30%)`,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 14, fontWeight: 700, flexShrink: 0,
                                        }}>
                                            {(user.display_name || user.email || '?')[0]?.toUpperCase()}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                                                {user.display_name || '이름 없음'}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                                                {user.email || '—'}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: '12px 16px' }}>{getSegmentBadge(user.segment)}</td>
                                <td style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                                    {user.auth_provider === 'google' ? '🔵 Google' :
                                        user.auth_provider === 'kakao' ? '🟡 카카오' :
                                            user.auth_provider === 'anonymous' ? '👤 게스트' :
                                                user.auth_provider || '—'}
                                </td>
                                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                    {user.total_sessions?.toLocaleString() || 0}
                                </td>
                                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                    {user.total_messages?.toLocaleString() || 0}
                                </td>
                                <td style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                                    {formatDate(user.last_active_at || '')}
                                </td>
                                <td style={{ padding: '12px 16px', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                                    {new Date(user.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 20 }}>
                    <button
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page === 1}
                        style={{
                            padding: '8px 14px', borderRadius: 10,
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(255,255,255,0.03)',
                            color: page === 1 ? 'rgba(255,255,255,0.15)' : '#fff',
                            fontSize: 13, cursor: page === 1 ? 'default' : 'pointer',
                        }}
                    > ← 이전</button>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', padding: '0 12px' }}>
                        {page} / {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page === totalPages}
                        style={{
                            padding: '8px 14px', borderRadius: 10,
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(255,255,255,0.03)',
                            color: page === totalPages ? 'rgba(255,255,255,0.15)' : '#fff',
                            fontSize: 13, cursor: page === totalPages ? 'default' : 'pointer',
                        }}
                    >다음 →</button>
                </div>
            )}
        </div>
    )
}
