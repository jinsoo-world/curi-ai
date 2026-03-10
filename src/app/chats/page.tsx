'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Image from 'next/image'
import { MembershipBanner } from '@/components/MembershipBanner'
import AppSidebar from '@/components/AppSidebar'

const MENTOR_IMAGES: Record<string, string> = {
    '열정진': '/mentors/passion-jjin.png',
    '글담쌤': '/mentors/geuldam.jpg',
    'Cathy': '/mentors/cathy.jpeg',
    '봉이 김선달': '/mentors/bongi-kimsundal.png',
    '신사임당': '/mentors/shin-saimdang.png',
}

const MENTOR_TITLES: Record<string, string> = {
    '열정진': '콘텐츠 수익화 / 브랜딩 전문가',
    '글담쌤': '글쓰기 & 콘텐츠 기획 전문가',
    'Cathy': '실전 마케팅 & 커뮤니티 전문가',
    '봉이 김선달': '세일즈 & 협상 전문가',
    '신사임당': '균형잡힌 라이프 & 자기계발 멘토',
}

interface Session {
    id: string
    mentor_id: string
    mentor_name: string
    mentor_slug: string
    last_message_at: string
    created_at: string
    message_count: number
    topic: string
}

interface MentorGroup {
    mentor_id: string
    mentor_name: string
    sessions: Session[]
}

export default function ChatsPage() {
    const router = useRouter()
    const supabase = createClient()
    const [groups, setGroups] = useState<MentorGroup[]>([])
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
                    mentors ( name, slug )
                `)
                .eq('user_id', user.id)
                .gt('message_count', 0)
                .order('last_message_at', { ascending: false, nullsFirst: false })
                .limit(30)

            if (data) {
                // 삭제된 AI(멘토)와의 대화 제외
                const activeSessions = data.filter((s: any) => s.mentors != null)

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
                            last_message_at: s.last_message_at || s.created_at,
                            created_at: s.created_at,
                            message_count: s.message_count || 0,
                            topic,
                        }
                    })
                )

                const mentorOrder: string[] = []
                const mentorMap: Record<string, MentorGroup> = {}

                for (const session of sessionsWithTopics) {
                    if (!mentorMap[session.mentor_id]) {
                        mentorMap[session.mentor_id] = {
                            mentor_id: session.mentor_id,
                            mentor_name: session.mentor_name,
                            sessions: [],
                        }
                        mentorOrder.push(session.mentor_id)
                    }
                    mentorMap[session.mentor_id].sessions.push(session)
                }

                setGroups(mentorOrder.map(id => mentorMap[id]))
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

    const truncate = (msg: string, maxLen = 55) => {
        if (!msg) return ''
        const clean = msg.replace(/\n/g, ' ').replace(/\*\*/g, '').trim()
        if (clean.length <= maxLen) return clean
        return clean.slice(0, maxLen) + '…'
    }

    const totalSessions = groups.reduce((sum, g) => sum + g.sessions.length, 0)

    return (
        <div style={{ minHeight: '100dvh', background: '#f8f9fa' }}>
            <AppSidebar />

            <div className="sidebar-content" style={{ marginLeft: 240, minHeight: '100dvh' }}>
                <MembershipBanner />

                {/* Content */}
                <section style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>
                    <h2 style={{
                        fontSize: 32, fontWeight: 800, color: '#18181b',
                        letterSpacing: '-0.03em', margin: '0 0 8px',
                    }}>
                        대화 내역
                    </h2>
                    <p style={{ fontSize: 16, color: '#9ca3af', margin: '0 0 32px' }}>
                        멘토와 나눈 대화를 다시 확인하세요
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
                    ) : totalSessions === 0 ? (
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
                                멘토를 선택하고 첫 대화를 시작해보세요!
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
                                멘토 둘러보기
                            </Link>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                            {groups.map((group) => {
                                const mentorImg = MENTOR_IMAGES[group.mentor_name]
                                const mentorTitle = MENTOR_TITLES[group.mentor_name] || ''

                                return (
                                    <div key={group.mentor_id} style={{
                                        background: '#fff', borderRadius: 20,
                                        border: '1px solid #f0f0f0',
                                        overflow: 'hidden',
                                    }}>
                                        {/* Mentor Header */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 14,
                                            padding: '18px 22px 14px',
                                            borderBottom: '1px solid #f5f5f5',
                                        }}>
                                            {mentorImg ? (
                                                <img
                                                    src={mentorImg}
                                                    alt={group.mentor_name}
                                                    style={{
                                                        width: 48, height: 48,
                                                        borderRadius: '50%', objectFit: 'cover',
                                                        flexShrink: 0,
                                                        border: '2px solid #f0fdf4',
                                                    }}
                                                />
                                            ) : (
                                                <div style={{
                                                    width: 48, height: 48, borderRadius: '50%',
                                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: 22, flexShrink: 0,
                                                }}>
                                                    🎓
                                                </div>
                                            )}
                                            <div style={{ flex: 1 }}>
                                                <div style={{
                                                    fontSize: 17, fontWeight: 700, color: '#18181b',
                                                    marginBottom: 2,
                                                }}>
                                                    {group.mentor_name}
                                                </div>
                                                {mentorTitle && (
                                                    <div style={{
                                                        fontSize: 13, color: '#a1a1aa',
                                                        fontWeight: 400,
                                                    }}>
                                                        {mentorTitle}
                                                    </div>
                                                )}
                                            </div>
                                            <span style={{
                                                fontSize: 12, color: '#16a34a',
                                                background: '#f0fdf4', borderRadius: 8,
                                                padding: '4px 10px', fontWeight: 600,
                                            }}>
                                                {group.sessions.length}개 대화
                                            </span>
                                        </div>

                                        {/* Session List */}
                                        <div>
                                            {group.sessions.map((session, idx) => {
                                                const isLast = idx === group.sessions.length - 1
                                                const topic = truncate(session.topic || '')

                                                return (
                                                    <Link
                                                        key={session.id}
                                                        href={`/chat/${session.mentor_id}?session=${session.id}`}
                                                        style={{
                                                            display: 'flex', alignItems: 'center',
                                                            padding: '14px 22px 14px 32px',
                                                            textDecoration: 'none', color: 'inherit',
                                                            borderBottom: isLast ? 'none' : '1px solid #fafafa',
                                                            transition: 'background 150ms',
                                                            gap: 12,
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.background = '#fafffe'
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.background = 'transparent'
                                                        }}
                                                    >
                                                        {/* Timeline dot + line */}
                                                        <div style={{
                                                            display: 'flex', flexDirection: 'column',
                                                            alignItems: 'center', flexShrink: 0,
                                                            width: 16, alignSelf: 'stretch',
                                                        }}>
                                                            <div style={{
                                                                width: 8, height: 8,
                                                                borderRadius: '50%',
                                                                background: idx === 0
                                                                    ? '#22c55e'
                                                                    : '#e4e4e7',
                                                                marginTop: 6,
                                                                flexShrink: 0,
                                                            }} />
                                                            {!isLast && (
                                                                <div style={{
                                                                    width: 1.5, flex: 1,
                                                                    background: '#f0f0f0',
                                                                    marginTop: 4,
                                                                }} />
                                                            )}
                                                        </div>

                                                        {/* Content */}
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            {topic ? (
                                                                <div style={{
                                                                    fontSize: 14, color: '#3f3f46',
                                                                    lineHeight: 1.5,
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

                                                        {/* Meta */}
                                                        <div style={{
                                                            display: 'flex', alignItems: 'center',
                                                            gap: 8, flexShrink: 0,
                                                        }}>
                                                            <span style={{
                                                                fontSize: 12, color: '#c4c4c4',
                                                                background: '#fafafa',
                                                                borderRadius: 6,
                                                                padding: '2px 6px',
                                                            }}>
                                                                💬{session.message_count}
                                                            </span>
                                                            <span style={{
                                                                fontSize: 13, color: '#b4b4b4',
                                                            }}>
                                                                {formatDate(session.last_message_at)}
                                                            </span>
                                                            <span style={{
                                                                fontSize: 14, color: '#d1d5db',
                                                            }}>
                                                                ›
                                                            </span>
                                                        </div>
                                                    </Link>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </section>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg) } }
                @media (max-width: 768px) {
                    .sidebar-content {
                        margin-left: 0 !important;
                        padding-bottom: 72px;
                    }
                }
            `}</style>
        </div>
    )
}
