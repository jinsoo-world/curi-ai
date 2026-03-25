'use client'

import { useState, useEffect } from 'react'

interface EbookLog {
    id: string
    user_id: string
    session_id: string
    mentor_id: string
    action: 'generate' | 'download'
    ebook_title: string
    created_at: string
    user_name: string
    mentor_name: string
}

interface Stats {
    generateCount: number
    downloadCount: number
    uniqueUsers: number
    conversionRate: number
}

export default function EbookLogsPage() {
    const [logs, setLogs] = useState<EbookLog[]>([])
    const [stats, setStats] = useState<Stats>({ generateCount: 0, downloadCount: 0, uniqueUsers: 0, conversionRate: 0 })
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'all' | 'generate' | 'download'>('all')

    useEffect(() => {
        async function loadLogs() {
            try {
                const res = await fetch('/api/admin/ebook-logs')
                const data = await res.json()
                setLogs(data.logs || [])
                setStats(data.stats || {})
            } catch (e) {
                console.error('전자책 로그 로드 실패:', e)
            } finally {
                setLoading(false)
            }
        }
        loadLogs()
    }, [])

    const filteredLogs = filter === 'all' ? logs : logs.filter(l => l.action === filter)

    const formatDate = (iso: string) => {
        const d = new Date(iso)
        return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }

    return (
        <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto' }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1a1a2e', margin: '0 0 8px' }}>
                📕 전자책 생성/다운로드 로그
            </h1>
            <p style={{ fontSize: 14, color: '#94a3b8', margin: '0 0 28px' }}>
                전자책 생성 및 PDF 다운로드 이력을 추적합니다.
            </p>

            {/* 통계 카드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 28 }}>
                {[
                    { label: '전자책 생성', value: stats.generateCount, emoji: '📝', color: '#6366f1' },
                    { label: 'PDF 다운로드', value: stats.downloadCount, emoji: '📄', color: '#10b981' },
                    { label: '이용 유저', value: stats.uniqueUsers, emoji: '👤', color: '#f59e0b' },
                    { label: '다운로드 전환율', value: `${stats.conversionRate}%`, emoji: '📈', color: '#ef4444' },
                ].map((stat, i) => (
                    <div key={i} style={{
                        background: '#fff', borderRadius: 14, padding: '20px 18px',
                        border: '1px solid #f0f0f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                    }}>
                        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>
                            {stat.emoji} {stat.label}
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: stat.color }}>
                            {stat.value}
                        </div>
                    </div>
                ))}
            </div>

            {/* 필터 */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {([
                    { key: 'all' as const, label: '전체' },
                    { key: 'generate' as const, label: '📝 생성' },
                    { key: 'download' as const, label: '📄 다운로드' },
                ]).map(f => (
                    <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        style={{
                            padding: '8px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                            border: filter === f.key ? '2px solid #6366f1' : '1px solid #e5e7eb',
                            background: filter === f.key ? '#f0f0ff' : '#fff',
                            color: filter === f.key ? '#6366f1' : '#64748b',
                            cursor: 'pointer', transition: 'all 0.15s ease',
                        }}
                    >{f.label}</button>
                ))}
            </div>

            {/* 로그 테이블 */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 14 }}>
                    로딩 중...
                </div>
            ) : filteredLogs.length === 0 ? (
                <div style={{
                    textAlign: 'center', padding: 60,
                    background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0',
                    color: '#94a3b8', fontSize: 14,
                }}>
                    아직 전자책 로그가 없습니다.
                </div>
            ) : (
                <div style={{
                    background: '#fff', borderRadius: 16, overflow: 'hidden',
                    border: '1px solid #f0f0f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>액션</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>유저</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>전자책 제목</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>멘토</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>시간</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredLogs.map(log => (
                                <tr key={log.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{
                                            display: 'inline-block', padding: '4px 10px', borderRadius: 12,
                                            fontSize: 12, fontWeight: 600,
                                            background: log.action === 'generate' ? '#ede9fe' : '#d1fae5',
                                            color: log.action === 'generate' ? '#7c3aed' : '#059669',
                                        }}>
                                            {log.action === 'generate' ? '📝 생성' : '📄 다운로드'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px', color: '#334155', fontWeight: 500 }}>
                                        {log.user_name}
                                    </td>
                                    <td style={{ padding: '12px 16px', color: '#1e293b', fontWeight: 500, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {log.ebook_title || '-'}
                                    </td>
                                    <td style={{ padding: '12px 16px', color: '#64748b' }}>
                                        {log.mentor_name}
                                    </td>
                                    <td style={{ padding: '12px 16px', color: '#94a3b8', fontSize: 12 }}>
                                        {formatDate(log.created_at)}
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
