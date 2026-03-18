'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface UserData {
    id: string
    email: string
    display_name: string
    avatar_url?: string | null
    created_at: string
    auth_provider: string
    segment?: string
    total_sessions?: number
    total_messages?: number
    last_active_at?: string
    phone?: string | null
    gender?: string | null
    birth_year?: number | null
    marketing_consent?: boolean | null
    subscription_tier?: string | null
    created_ai_count?: number
    clovers?: number
    attendance_days?: number
    user_number?: number
}

interface UsersResponse {
    users: UserData[]
    totalCount: number
    page: number
    pageSize: number
    segments: Record<string, number>
}

const SEGMENT_CONFIG: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
    all: { label: '전체', emoji: '👥', color: '#64748b', bg: '#f1f5f9' },
    new: { label: '신규', emoji: '🆕', color: '#16a34a', bg: '#dcfce7' },
    light: { label: '라이트', emoji: '💡', color: '#2563eb', bg: '#dbeafe' },
    heavy: { label: '헤비', emoji: '🔥', color: '#d97706', bg: '#fef3c7' },
    dormant: { label: '휴면', emoji: '😴', color: '#7c3aed', bg: '#ede9fe' },
    churned: { label: '이탈', emoji: '💔', color: '#dc2626', bg: '#fee2e2' },
}

const PROVIDER_CONFIG: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
    google: { label: 'Google', emoji: '🔵', color: '#1d4ed8', bg: '#dbeafe' },
    kakao: { label: '카카오', emoji: '🟡', color: '#92400e', bg: '#fef3c7' },
    anonymous: { label: '게스트', emoji: '👤', color: '#64748b', bg: '#f1f5f9' },
    unknown: { label: '알 수 없음', emoji: '❓', color: '#94a3b8', bg: '#f1f5f9' },
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

    const formatRelativeTime = (d: string | undefined | null) => {
        if (!d) return '—'
        const date = new Date(d)
        const now = new Date()
        const diffMin = Math.floor((now.getTime() - date.getTime()) / 60000)
        if (diffMin < 1) return '방금 전'
        if (diffMin < 60) return `${diffMin}분 전`
        const diffH = Math.floor(diffMin / 60)
        if (diffH < 24) return `${diffH}시간 전`
        const diffD = Math.floor(diffH / 24)
        if (diffD < 7) return `${diffD}일 전`
        if (diffD < 30) return `${Math.floor(diffD / 7)}주 전`
        return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    }

    const formatDate = (d: string) => {
        if (!d) return '—'
        return new Date(d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    }

    const getSegmentBadge = (seg?: string) => {
        const cfg = SEGMENT_CONFIG[seg || ''] || { label: seg || '—', color: '#64748b', bg: '#f1f5f9', emoji: '' }
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

    const getProviderBadge = (provider: string) => {
        const cfg = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG['unknown']
        return (
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
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
                <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#1e293b' }}>👥 유저 관리</h1>
                <p style={{ color: '#94a3b8', fontSize: 13, margin: '6px 0 0' }}>
                    전체 {data?.totalCount?.toLocaleString() || 0}명 · 세그먼트별 분석
                </p>
            </div>

            {/* 세그먼트 필터 바 */}
            <div style={{
                display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20,
                background: '#fff', borderRadius: 14, padding: 6,
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
                {Object.entries(SEGMENT_CONFIG).map(([key, cfg]) => (
                    <button
                        key={key}
                        onClick={() => { setSegment(key); setPage(1) }}
                        style={{
                            padding: '8px 16px', borderRadius: 10,
                            border: segment === key ? `1px solid ${cfg.color}40` : '1px solid transparent',
                            background: segment === key ? cfg.bg : 'transparent',
                            color: segment === key ? cfg.color : '#94a3b8',
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
                        borderRadius: 12, border: '1px solid #e5e7eb',
                        background: '#fff',
                        color: '#1e293b', fontSize: 14, outline: 'none',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                />
            </div>

            {/* 유저 테이블 */}
            <div style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 16, overflow: 'auto',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
                            {[
                                { key: 'user_number', label: '#' },
                                { key: 'display_name', label: '유저' },
                                { key: 'auth_provider', label: '가입경로' },
                                { key: 'segment', label: '세그먼트' },
                                { key: 'phone', label: '전화번호' },
                                { key: 'gender', label: '성별' },
                                { key: 'birth_year', label: '생년' },
                                { key: 'subscription_tier', label: '체험권' },
                                { key: 'clovers', label: '🍀 클로버' },
                                { key: 'created_ai_count', label: '만든AI' },
                                { key: 'total_sessions', label: '세션' },
                                { key: 'total_messages', label: '메시지' },
                                { key: 'attendance_days', label: '출석일' },
                                { key: 'created_at', label: '가입일' },
                                { key: 'last_active_at', label: '최근활동' },
                                { key: 'marketing_consent', label: '마케팅' },
                            ].map(col => (
                                <th
                                    key={col.key}
                                    onClick={() => toggleSort(col.key)}
                                    style={{
                                        padding: '12px 14px',
                                        textAlign: 'left', fontSize: 11, fontWeight: 700,
                                        color: sortBy === col.key ? '#4f46e5' : '#64748b',
                                        cursor: 'pointer', userSelect: 'none',
                                        letterSpacing: 0.5, textTransform: 'uppercase',
                                        whiteSpace: 'nowrap',
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
                            <tr><td colSpan={16} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>로딩 중...</td></tr>
                        ) : !data?.users?.length ? (
                            <tr><td colSpan={16} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>유저 없음</td></tr>
                        ) : data.users.map((user, i) => (
                            <tr
                                key={user.id}
                                onClick={() => router.push(`/admin/users/${user.id}`)}
                                style={{
                                    borderBottom: '1px solid #f1f5f9',
                                    background: i % 2 === 0 ? '#fff' : '#fafbfc',
                                    transition: 'background 0.2s',
                                    cursor: 'pointer',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = '#f0f0ff')}
                                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#fafbfc')}
                            >
                                <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: '#4f46e5', fontVariantNumeric: 'tabular-nums', textAlign: 'center', minWidth: 40 }}>
                                    {(user as UserData).user_number || '—'}
                                </td>
                                <td style={{ padding: '12px 14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        {user.avatar_url ? (
                                            <img
                                                src={user.avatar_url}
                                                alt=""
                                                style={{
                                                    width: 32, height: 32, borderRadius: '50%',
                                                    objectFit: 'cover', flexShrink: 0,
                                                }}
                                            />
                                        ) : (
                                            <div style={{
                                                width: 32, height: 32, borderRadius: '50%',
                                                background: `hsl(${user.id.charCodeAt(0) * 7 % 360}, 45%, 65%)`,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 14, fontWeight: 700, flexShrink: 0, color: '#fff',
                                            }}>
                                                {(user.display_name || user.email || '?')[0]?.toUpperCase()}
                                            </div>
                                        )}
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                                                {user.display_name || '이름 없음'}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                                {user.email || '—'}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: '12px 14px' }}>{getProviderBadge(user.auth_provider)}</td>
                                <td style={{ padding: '12px 14px' }}>{getSegmentBadge(user.segment)}</td>
                                <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                                    {user.phone ? user.phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3') : '—'}
                                </td>
                                <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>
                                    {user.gender || '—'}
                                </td>
                                <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                                    {user.birth_year || '—'}
                                </td>
                                <td style={{ padding: '12px 14px' }}>
                                    {user.subscription_tier === 'free_trial' ? (
                                        <span style={{
                                            fontSize: 11, fontWeight: 600,
                                            padding: '3px 10px', borderRadius: 20,
                                            background: '#dcfce7', color: '#16a34a',
                                        }}>
                                            🎁 체험중
                                        </span>
                                    ) : user.subscription_tier === 'premium' ? (
                                        <span style={{
                                            fontSize: 11, fontWeight: 600,
                                            padding: '3px 10px', borderRadius: 20,
                                            background: '#ede9fe', color: '#7c3aed',
                                        }}>
                                            ✨ 프리미엄
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>
                                    )}
                                </td>
                                <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', textAlign: 'center', color: '#16a34a' }}>
                                    {(user.clovers || 0).toLocaleString()}
                                </td>
                                <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', textAlign: 'center', color: '#1e293b' }}>
                                    {(user as UserData).created_ai_count || 0}
                                </td>
                                <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#1e293b' }}>
                                    {user.total_sessions?.toLocaleString() || 0}
                                </td>
                                <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#1e293b' }}>
                                    {user.total_messages?.toLocaleString() || 0}
                                </td>
                                <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'center', color: '#f59e0b' }}>
                                    {(user as UserData).attendance_days || 0}
                                </td>
                                <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b' }}>
                                    {formatDate(user.created_at)}
                                </td>
                                <td style={{ padding: '12px 14px', fontSize: 12, color: user.last_active_at ? '#1e293b' : '#cbd5e1', fontWeight: user.last_active_at ? 500 : 400 }}>
                                    {formatRelativeTime(user.last_active_at)}
                                </td>
                                <td style={{ padding: '12px 14px', fontSize: 12, textAlign: 'center' }}>
                                    {user.marketing_consent ? (
                                        <span style={{ color: '#16a34a' }}>✅</span>
                                    ) : (
                                        <span style={{ color: '#cbd5e1' }}>—</span>
                                    )}
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
                            border: '1px solid #e5e7eb',
                            background: '#fff',
                            color: page === 1 ? '#cbd5e1' : '#1e293b',
                            fontSize: 13, cursor: page === 1 ? 'default' : 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        }}
                    > ← 이전</button>
                    <span style={{ fontSize: 13, color: '#64748b', padding: '0 12px' }}>
                        {page} / {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page === totalPages}
                        style={{
                            padding: '8px 14px', borderRadius: 10,
                            border: '1px solid #e5e7eb',
                            background: '#fff',
                            color: page === totalPages ? '#cbd5e1' : '#1e293b',
                            fontSize: 13, cursor: page === totalPages ? 'default' : 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        }}
                    >다음 →</button>
                </div>
            )}
        </div>
    )
}
