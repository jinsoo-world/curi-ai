'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { MembershipBanner } from '@/components/MembershipBanner'
import AppSidebar from '@/components/AppSidebar'

// 하드코딩 fallback
const MENTOR_IMAGES: Record<string, string> = {
    '열정진': '/mentors/passion-jjin.png',
    '글담쌤': '/mentors/geuldam.jpg',
    'Cathy': '/mentors/cathy.jpeg',
    '봉이 김선달': '/mentors/bongi-kimsundal.png',
    '신사임당': '/mentors/shin-saimdang.png',
}

interface FlatSession {
    id: string
    mentor_id: string
    mentor_name: string
    mentor_slug: string
    mentor_avatar_url: string | null
    last_message_at: string
    created_at: string
    message_count: number
    topic: string
}

export default function ChatsPage() {
    const router = useRouter()
    const supabase = createClient()
    const [sessions, setSessions] = useState<FlatSession[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [user, setUser] = useState<any>(null)

    useEffect(() => {
        async function loadSessions() {
            const { data: { user } } = await supabase.auth.getUser()
            setUser(user)

            if (!user) {
                setIsLoading(false)
                return
            }

            const { data } = await supabase
                .from('chat_sessions')
                .select(`
                    id,
                    mentor_id,
                    created_at,
                    last_message_at,
                    message_count,
                    title,
                    mentors ( name, slug, avatar_url, is_active )
                `)
                .eq('user_id', user.id)
                .gt('message_count', 0)
                .order('last_message_at', { ascending: false, nullsFirst: false })
                .limit(30)

            if (data) {
                const activeSessions = data.filter((s: any) => s.mentors != null && s.mentors.is_active !== false)

                const sessionsWithTopics = await Promise.all(
                    activeSessions.map(async (s: any) => {
                        const isGenericTitle = !s.title || s.title.endsWith('와의 대화')
                        let topic = isGenericTitle ? '' : s.title

                        if (!topic) {
                            const { data: firstUserMsg } = await supabase
                                .from('messages')
                                .select('content')
                                .eq('session_id', s.id)
                                .eq('role', 'user')
                                .order('created_at', { ascending: true })
                                .limit(1)
                                .single()
                            topic = firstUserMsg?.content || ''
                        }

                        return {
                            id: s.id,
                            mentor_id: s.mentor_id,
                            mentor_name: s.mentors?.name || '멘토',
                            mentor_slug: s.mentors?.slug || s.mentor_id,
                            mentor_avatar_url: s.mentors?.avatar_url || null,
                            last_message_at: s.last_message_at || s.created_at,
                            created_at: s.created_at,
                            message_count: s.message_count || 0,
                            topic,
                        }
                    })
                )

                setSessions(sessionsWithTopics)
            }
            setIsLoading(false)
        }
        loadSessions()
    }, [])

    const formatDate = (dateString: string) => {
        const date = new Date(dateString)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMin = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMs / 3600000)
        const diffDays = Math.floor(diffMs / 86400000)

        if (diffMin < 1) return '방금 전'
        if (diffMin < 60) return `${diffMin}분 전`
        if (diffHours < 24) return `${diffHours}시간 전`
        if (diffDays < 7) return `${diffDays}일 전`
        return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
    }

    const truncate = (msg: string, maxLen = 40) => {
        if (!msg) return ''
        const clean = msg.replace(/\n/g, ' ').replace(/\*\*/g, '').trim()
        if (clean.length <= maxLen) return clean
        return clean.slice(0, maxLen) + '…'
    }

    const getMentorImage = (session: FlatSession) => {
        return session.mentor_avatar_url || MENTOR_IMAGES[session.mentor_name] || null
    }

    return (
        <div style={{ minHeight: '100dvh', background: '#f8f9fa' }}>
            <AppSidebar />

            <div className="sidebar-content" style={{ marginLeft: 240, minHeight: '100dvh' }}>
                <MembershipBanner />

                <section style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>
                    <h2 style={{
                        fontSize: 28, fontWeight: 800, color: '#18181b',
                        letterSpacing: '-0.03em', margin: '0 0 6px',
                    }}>
                        대화 내역
                    </h2>
                    <p style={{ fontSize: 15, color: '#9ca3af', margin: '0 0 24px' }}>
                        AI와 나눈 대화를 다시 확인하세요
                    </p>

                    {isLoading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
                            <div style={{
                                width: 32, height: 32,
                                border: '3px solid #e4e4e7',
                                borderTop: '3px solid #22c55e',
                                borderRadius: '50%',
                                animation: 'spin 1s linear infinite',
                            }} />
                        </div>
                    ) : !user ? (
                        <div style={{
                            textAlign: 'center', padding: '60px 20px',
                            background: '#fff', borderRadius: 20,
                            border: '1px solid #f0f0f0',
                        }}>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
                            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#18181b', marginBottom: 8 }}>
                                로그인이 필요합니다
                            </h3>
                            <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 24 }}>
                                대화 내역을 보려면 먼저 로그인해주세요
                            </p>
                            <Link
                                href="/login"
                                style={{
                                    display: 'inline-block',
                                    padding: '14px 32px',
                                    borderRadius: 14,
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    color: '#fff', textDecoration: 'none',
                                    fontWeight: 600, fontSize: 16,
                                    boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                                }}
                            >
                                로그인하기
                            </Link>
                        </div>
                    ) : sessions.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '60px 20px',
                            background: '#fff', borderRadius: 20,
                            border: '1px solid #f0f0f0',
                        }}>
                            <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
                            <h3 style={{ fontSize: 20, fontWeight: 700, color: '#18181b', marginBottom: 8 }}>
                                아직 대화가 없어요
                            </h3>
                            <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 24 }}>
                                AI를 선택하고 첫 대화를 시작해보세요!
                            </p>
                            <Link
                                href="/mentors"
                                style={{
                                    display: 'inline-block',
                                    padding: '14px 32px',
                                    borderRadius: 14,
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    color: '#fff', textDecoration: 'none',
                                    fontWeight: 600, fontSize: 16,
                                    boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                                }}
                            >
                                AI 둘러보기
                            </Link>
                        </div>
                    ) : (
                        <div className="chat-grid" style={{
                            display: 'flex', flexDirection: 'column', gap: 10,
                        }}>
                            {sessions.map((session) => {
                                const mentorImg = getMentorImage(session)
                                const topic = truncate(session.topic || '')

                                return (
                                    <Link
                                        key={session.id}
                                        href={`/chat/${session.mentor_id}?session=${session.id}`}
                                        className="chat-card"
                                        style={{
                                            display: 'flex', alignItems: 'center',
                                            gap: 14, padding: '14px 18px',
                                            background: '#fff', borderRadius: 16,
                                            border: '1px solid #f0f0f0',
                                            textDecoration: 'none', color: 'inherit',
                                            transition: 'box-shadow 150ms, border-color 150ms',
                                        }}
                                    >
                                        {/* 멘토 아바타 */}
                                        {mentorImg ? (
                                            <img
                                                src={mentorImg}
                                                alt={session.mentor_name}
                                                style={{
                                                    width: 44, height: 44,
                                                    borderRadius: '50%', objectFit: 'cover',
                                                    flexShrink: 0,
                                                    border: '2px solid #f0fdf4',
                                                }}
                                            />
                                        ) : (
                                            <div style={{
                                                width: 44, height: 44, borderRadius: '50%',
                                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: 20, flexShrink: 0, color: '#fff',
                                            }}>
                                                🎓
                                            </div>
                                        )}

                                        {/* 내용 */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                display: 'flex', alignItems: 'center',
                                                gap: 6, marginBottom: 3,
                                            }}>
                                                <span style={{
                                                    fontSize: 15, fontWeight: 700, color: '#18181b',
                                                }}>
                                                    {session.mentor_name}
                                                </span>
                                                <span style={{
                                                    fontSize: 12, color: '#b0b8c1',
                                                }}>
                                                    {formatDate(session.last_message_at)}
                                                </span>
                                            </div>
                                            {topic ? (
                                                <div style={{
                                                    fontSize: 14, color: '#6b7280',
                                                    lineHeight: 1.4,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {topic}
                                                </div>
                                            ) : (
                                                <div style={{
                                                    fontSize: 14, color: '#d1d5db',
                                                    fontStyle: 'italic',
                                                }}>
                                                    대화를 시작해보세요
                                                </div>
                                            )}
                                        </div>

                                        {/* 메시지 수 뱃지 */}
                                        <span style={{
                                            fontSize: 11, color: '#9ca3af',
                                            background: '#f5f5f5',
                                            borderRadius: 8,
                                            padding: '3px 8px',
                                            flexShrink: 0,
                                            fontWeight: 500,
                                        }}>
                                            💬 {session.message_count}
                                        </span>
                                    </Link>
                                )
                            })}
                        </div>
                    )}
                </section>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg) } }
                .chat-card:hover {
                    box-shadow: 0 2px 12px rgba(0,0,0,0.06) !important;
                    border-color: #e0e0e0 !important;
                }
                @media (max-width: 768px) {
                    .sidebar-content {
                        margin-left: 0 !important;
                        padding-bottom: 72px;
                    }
                    .chat-grid {
                        display: grid !important;
                        grid-template-columns: 1fr 1fr !important;
                        gap: 10px !important;
                    }
                    .chat-card {
                        flex-direction: column !important;
                        align-items: flex-start !important;
                        padding: 14px !important;
                        gap: 10px !important;
                    }
                    .chat-card img, .chat-card > div:first-child {
                        width: 36px !important;
                        height: 36px !important;
                    }
                }
            `}</style>
        </div>
    )
}
