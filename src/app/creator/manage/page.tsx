'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface MentorItem {
    id: string
    name: string
    title: string
    mentor_type: string
    status: string
    is_active: boolean
    created_at: string
}

export default function CreatorManagePage() {
    const router = useRouter()
    const [mentors, setMentors] = useState<MentorItem[]>([])
    const [loading, setLoading] = useState(true)
    const [deleting, setDeleting] = useState<string | null>(null)
    const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)

    const [role, setRole] = useState<string>('')
    const [unauthorized, setUnauthorized] = useState(false)

    useEffect(() => {
        fetchMentors()
    }, [])

    async function fetchMentors() {
        try {
            const res = await fetch('/api/creator/mentor/list')
            const data = await res.json()
            if (res.status === 401) {
                // 비로그인 → 로그인 페이지
                router.push('/login')
                return
            }
            if (res.ok) {
                const userRole = data.role || ''
                setRole(userRole)
                if (userRole === 'member') {
                    // 일반 회원 → 권한 없음
                    setUnauthorized(true)
                } else {
                    setMentors(data.mentors || [])
                }
            }
        } catch {
            console.error('Failed to fetch mentors')
        } finally {
            setLoading(false)
        }
    }

    async function executeDelete(mentorId: string) {
        setDeleting(mentorId)
        try {
            const res = await fetch('/api/creator/mentor/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mentorId }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error)

            setMentors(prev => prev.filter(m => m.id !== mentorId))
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.')
        } finally {
            setDeleting(null)
            setConfirmingDelete(null)
        }
    }

    const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
        active: { label: '활성', color: '#15803d', bg: '#f0fdf4' },
        draft: { label: '초안', color: '#d97706', bg: '#fffbeb' },
        review: { label: '심사중', color: '#2563eb', bg: '#eff6ff' },
        suspended: { label: '중지됨', color: '#dc2626', bg: '#fef2f2' },
        rejected: { label: '거절됨', color: '#6b7280', bg: '#f9fafb' },
        inactive: { label: '비활성', color: '#9ca3af', bg: '#f3f4f6' },
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h1 style={styles.heading}>🛠️ AI 관리</h1>
                <p style={styles.subheading}>내가 만든 AI를 수정·삭제할 수 있습니다</p>
            </div>

            <div style={styles.actions}>
                <button
                    style={styles.createBtn}
                    onClick={() => router.push('/creator/create')}
                >
                    ＋ 새 AI 만들기
                </button>
                <button
                    style={styles.backBtn}
                    onClick={() => router.push('/mentors')}
                >
                    ← 멘토 목록
                </button>
            </div>

            {loading ? (
                <div style={styles.emptyState}>불러오는 중...</div>
            ) : unauthorized ? (
                <div style={styles.emptyState}>
                    <div style={{ fontSize: 48 }}>🔒</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#18181b' }}>접근 권한이 없습니다</div>
                    <div style={{ fontSize: 14, color: '#9ca3af' }}>크리에이터 또는 관리자만 이용 가능합니다</div>
                    <button
                        style={styles.backBtn}
                        onClick={() => router.push('/mentors')}
                    >
                        ← 멘토 목록으로 돌아가기
                    </button>
                </div>
            ) : mentors.length === 0 ? (
                <div style={styles.emptyState}>
                    <div style={{ fontSize: 48 }}>📭</div>
                    <div>아직 만든 AI가 없습니다</div>
                    <button
                        style={styles.createBtn}
                        onClick={() => router.push('/creator/create')}
                    >
                        첫 AI 만들기
                    </button>
                </div>
            ) : (
                <div style={styles.list}>
                    {mentors.map(m => {
                        const effectiveStatus = !m.is_active ? 'inactive' : m.status
                        const st = statusLabels[effectiveStatus] || statusLabels.draft
                        const isConfirming = confirmingDelete === m.id
                        const isDeleting = deleting === m.id

                        return (
                            <div key={m.id} style={styles.card}>
                                <div style={styles.cardInfo}>
                                    <div style={styles.cardName}>
                                        {m.name}
                                        <span style={{
                                            ...styles.badge,
                                            color: st.color,
                                            background: st.bg,
                                        }}>
                                            {st.label}
                                        </span>
                                        {m.mentor_type === 'creator' && (
                                            <span style={styles.badgeCreator}>크리에이터</span>
                                        )}
                                    </div>
                                    <div style={styles.cardTitle}>{m.title}</div>
                                    <div style={styles.cardMeta}>
                                        생성: {new Date(m.created_at).toLocaleDateString('ko-KR')}
                                    </div>
                                </div>

                                <div style={styles.cardActions}>
                                    {isConfirming ? (
                                        /* 인라인 삭제 확인 */
                                        <div style={styles.confirmRow}>
                                            <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 500 }}>
                                                삭제할까요?
                                            </span>
                                            <button
                                                style={styles.confirmYes}
                                                onClick={() => executeDelete(m.id)}
                                                disabled={isDeleting}
                                            >
                                                {isDeleting ? '...' : '✓ 확인'}
                                            </button>
                                            <button
                                                style={styles.confirmNo}
                                                onClick={() => setConfirmingDelete(null)}
                                                disabled={isDeleting}
                                            >
                                                취소
                                            </button>
                                        </div>
                                    ) : (
                                        /* 수정 + 삭제 버튼 */
                                        <div style={styles.btnGroup}>
                                            <button
                                                style={styles.editBtn}
                                                onClick={() => router.push(`/creator/edit/${m.id}`)}
                                            >
                                                ✏️ 수정
                                            </button>
                                            <button
                                                style={styles.deleteBtn}
                                                onClick={() => setConfirmingDelete(m.id)}
                                            >
                                                🗑️ 삭제
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        maxWidth: 600,
        margin: '0 auto',
        padding: '24px 16px 80px',
        minHeight: '100dvh',
        background: '#f8f9fa',
        color: '#1a1a2e',
        fontFamily: 'var(--font-noto-sans-kr), Pretendard, sans-serif',
    },
    header: {
        marginBottom: 20,
    },
    heading: {
        fontSize: 24,
        fontWeight: 700,
        margin: '0 0 6px',
    },
    subheading: {
        fontSize: 14,
        color: '#6b7280',
        margin: 0,
    },
    actions: {
        display: 'flex',
        gap: 10,
        marginBottom: 20,
    },
    createBtn: {
        padding: '10px 18px',
        borderRadius: 10,
        border: 'none',
        background: '#22c55e',
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
    },
    backBtn: {
        padding: '10px 18px',
        borderRadius: 10,
        border: '1px solid #e5e7eb',
        background: '#fff',
        color: '#6b7280',
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
    },
    list: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
    },
    card: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px',
        borderRadius: 14,
        background: '#fff',
        border: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    },
    cardInfo: {
        flex: 1,
        minWidth: 0,
    },
    cardName: {
        fontSize: 16,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    cardTitle: {
        fontSize: 13,
        color: '#6b7280',
        marginTop: 4,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    cardMeta: {
        fontSize: 11,
        color: '#9ca3af',
        marginTop: 4,
    },
    cardActions: {
        flexShrink: 0,
        marginLeft: 12,
    },
    badge: {
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 6,
    },
    badgeCreator: {
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 6,
        color: '#7c3aed',
        background: '#f5f3ff',
    },
    btnGroup: {
        display: 'flex',
        gap: 6,
    },
    editBtn: {
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid #e5e7eb',
        background: '#fff',
        color: '#374151',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
    },
    deleteBtn: {
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid #fca5a5',
        background: '#fff',
        color: '#dc2626',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
    },
    confirmRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
    },
    confirmYes: {
        padding: '6px 12px',
        borderRadius: 6,
        border: 'none',
        background: '#dc2626',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
    },
    confirmNo: {
        padding: '6px 10px',
        borderRadius: 6,
        border: '1px solid #d1d5db',
        background: '#fff',
        color: '#6b7280',
        fontSize: 12,
        cursor: 'pointer',
    },
    emptyState: {
        textAlign: 'center',
        padding: '60px 20px',
        color: '#6b7280',
        fontSize: 15,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
    },
}
