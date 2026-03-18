'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'

const MENTOR_IMAGES: Record<string, string> = {
    '열정진': '/mentors/passion-jjin.png',
    '글담쌤': '/mentors/geuldam.jpg',
    'Cathy': '/mentors/cathy.jpeg',
    '봉이 김선달': '/mentors/bongi-kimsundal.png',
    '신사임당': '/mentors/shin-saimdang.png',
    '갓출리더의 홧병상담소': '/mentors/god-leader.png',
}

interface MentorDetail {
    id: string; name: string; slug: string; title: string
    avatar_url: string | null; description: string; expertise: string[]
    status: string; created_at: string
}

interface MemberSession {
    id: string; user_id: string; title: string; message_count: number
    last_message_at: string; created_at: string
    users: { id: string; email: string; display_name: string | null; avatar_url: string | null } | null
    messages: { role: string; content: string; created_at: string }[]
}

interface GuestSession {
    visitor_id: string; message_count: number
    first_message_at: string; last_message_at: string
    device: string | null; country: string | null
    messages: { user_message: string; ai_response: string; created_at: string }[]
}

type Tab = 'member' | 'guest'

function formatTime(dateStr?: string) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function timeAgo(dateStr?: string) {
    if (!dateStr) return ''
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}분 전`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}시간 전`
    const days = Math.floor(hours / 24)
    return `${days}일 전`
}

export default function MentorDetailPage() {
    const params = useParams()
    const router = useRouter()
    const mentorId = params.mentorId as string

    const [loading, setLoading] = useState(true)
    const [mentor, setMentor] = useState<MentorDetail | null>(null)
    const [memberSessions, setMemberSessions] = useState<MemberSession[]>([])
    const [guestSessions, setGuestSessions] = useState<GuestSession[]>([])
    const [stats, setStats] = useState<any>({})
    const [tab, setTab] = useState<Tab>('member')
    const [expandedSession, setExpandedSession] = useState<string | null>(null)

    useEffect(() => {
        fetch(`/api/admin/mentors/${mentorId}`)
            .then(r => r.json())
            .then(d => {
                setMentor(d.mentor)
                setMemberSessions(d.memberSessions || [])
                setGuestSessions(d.guestSessions || [])
                setStats(d.stats || {})
            })
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [mentorId])

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid #e0e7ff', borderTopColor: '#6366f1', animation: 'spin 1s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
    )

    if (!mentor) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>멘토를 찾을 수 없습니다</div>

    const mentorImg = mentor.avatar_url || MENTOR_IMAGES[mentor.name] || null

    return (
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <AdminMdStyle />
            {/* 뒤로 가기 */}
            <button onClick={() => router.push('/admin/mentors')} style={{
                background: 'none', border: 'none', cursor: 'pointer', color: '#6366f1', fontSize: 14, fontWeight: 600,
                marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6,
            }}>
                ← 멘토 목록
            </button>

            {/* 멘토 프로필 카드 */}
            <div style={{
                background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
                padding: '28px 32px', marginBottom: 24,
                display: 'flex', alignItems: 'center', gap: 20,
            }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: '#f1f5f9', flexShrink: 0 }}>
                    {mentorImg ? (
                        <Image src={mentorImg} alt={mentor.name} width={72} height={72} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                    ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🤖</div>
                    )}
                </div>
                <div style={{ flex: 1 }}>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>{mentor.name}</h1>
                    <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>{mentor.title}</p>
                </div>
                <div style={{ display: 'flex', gap: 24, textAlign: 'center' }}>
                    {[
                        { label: '회원 세션', value: stats.totalMemberSessions || 0, color: '#6366f1' },
                        { label: '비회원 세션', value: stats.totalGuestSessions || 0, color: '#f59e0b' },
                        { label: '회원', value: stats.uniqueMembers || 0, color: '#10b981' },
                        { label: '비회원', value: stats.uniqueGuests || 0, color: '#ef4444' },
                    ].map(s => (
                        <div key={s.label}>
                            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* 탭 */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
                {([
                    { key: 'member' as Tab, label: `👤 회원 대화 (${stats.totalMemberSessions || 0})` },
                    { key: 'guest' as Tab, label: `👻 비회원 대화 (${stats.totalGuestSessions || 0})` },
                ]).map(t => (
                    <button key={t.key} onClick={() => { setTab(t.key); setExpandedSession(null) }} style={{
                        padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: tab === t.key ? '#6366f1' : '#f1f5f9',
                        color: tab === t.key ? '#fff' : '#64748b',
                        fontWeight: 600, fontSize: 14, transition: 'all 0.2s',
                    }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* 대화 목록 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tab === 'member' && memberSessions.map(session => {
                    const isExpanded = expandedSession === session.id
                    const user = session.users as any
                    return (
                        <div key={session.id} style={{
                            background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
                            overflow: 'hidden', transition: 'all 0.2s',
                        }}>
                            {/* 세션 헤더 */}
                            <button onClick={() => setExpandedSession(isExpanded ? null : session.id)} style={{
                                width: '100%', padding: '16px 20px', border: 'none', cursor: 'pointer',
                                background: isExpanded ? '#f8fafc' : '#fff',
                                display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
                            }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: '50%', background: '#e0e7ff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 14, fontWeight: 700, color: '#6366f1', flexShrink: 0,
                                }}>
                                    {(user?.display_name || user?.email || '?')[0]?.toUpperCase()}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>
                                        {user?.display_name || user?.email?.split('@')[0] || '알 수 없는 유저'}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                                        {user?.email} · {session.messages?.length || 0}개 메시지 · {timeAgo(session.last_message_at)}
                                    </div>
                                </div>
                                <span style={{ fontSize: 18, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                            </button>

                            {/* 대화 내용 */}
                            {isExpanded && (
                                <div style={{ padding: '0 20px 20px', maxHeight: 400, overflowY: 'auto' }}>
                                    {session.messages.map((msg, i) => (
                                        <div key={i} style={{
                                            display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                                            gap: 8, marginTop: 10,
                                        }}>
                                            <div style={{ fontSize: 11, color: '#94a3b8', minWidth: 30, textAlign: 'center', paddingTop: 6 }}>
                                                {msg.role === 'user' ? '👤' : '🤖'}
                                            </div>
                                            <div style={{
                                                maxWidth: '75%', padding: '10px 14px', borderRadius: 12,
                                                background: msg.role === 'user' ? '#6366f1' : '#f1f5f9',
                                                color: msg.role === 'user' ? '#fff' : '#1e293b',
                                                fontSize: 13, lineHeight: 1.6, wordBreak: 'break-word',
                                            }}>
                                                {msg.role === 'user' ? msg.content : (
                                                    <div className="admin-md"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {session.messages.length === 0 && (
                                        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 20 }}>메시지 없음</div>
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })}

                {tab === 'guest' && guestSessions.map((session, idx) => {
                    const isExpanded = expandedSession === session.visitor_id
                    return (
                        <div key={session.visitor_id + idx} style={{
                            background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
                            overflow: 'hidden',
                        }}>
                            <button onClick={() => setExpandedSession(isExpanded ? null : session.visitor_id)} style={{
                                width: '100%', padding: '16px 20px', border: 'none', cursor: 'pointer',
                                background: isExpanded ? '#fffbeb' : '#fff',
                                display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
                            }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: '50%', background: '#fef3c7',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 16, flexShrink: 0,
                                }}>👻</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e' }}>
                                        비회원 #{session.visitor_id?.substring(0, 8) || 'unknown'}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                                        {session.message_count}개 메시지 · {session.device || ''} {session.country ? `· ${session.country}` : ''} · {timeAgo(session.last_message_at)}
                                    </div>
                                </div>
                                <span style={{ fontSize: 18, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                            </button>

                            {isExpanded && (
                                <div style={{ padding: '0 20px 20px', maxHeight: 400, overflowY: 'auto' }}>
                                    {session.messages.map((msg, i) => (
                                        <div key={i} style={{ marginTop: 12 }}>
                                            {/* 유저 메시지 */}
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 6 }}>
                                                <div style={{
                                                    maxWidth: '75%', padding: '10px 14px', borderRadius: 12,
                                                    background: '#f59e0b', color: '#fff', fontSize: 13, lineHeight: 1.6,
                                                }}>
                                                    {msg.user_message}
                                                </div>
                                                <div style={{ fontSize: 11, color: '#94a3b8', paddingTop: 6 }}>👤</div>
                                            </div>
                                            {/* AI 응답 */}
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                <div style={{ fontSize: 11, color: '#94a3b8', paddingTop: 6 }}>🤖</div>
                                                <div style={{
                                                    maxWidth: '75%', padding: '10px 14px', borderRadius: 12,
                                                    background: '#f1f5f9', color: '#1e293b', fontSize: 13, lineHeight: 1.6,
                                                }}>
                                                    <div className="admin-md"><ReactMarkdown>{msg.ai_response}</ReactMarkdown></div>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'center', fontSize: 10, color: '#cbd5e1', marginTop: 4 }}>
                                                {formatTime(msg.created_at)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}

                {/* 빈 상태 */}
                {tab === 'member' && memberSessions.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40, fontSize: 14 }}>회원 대화 내역이 없습니다</div>
                )}
                {tab === 'guest' && guestSessions.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40, fontSize: 14 }}>비회원 대화 내역이 없습니다</div>
                )}
            </div>
        </div>
    )
}

/* 어드민 마크다운 스타일 — 인라인 global */
const AdminMdStyle = () => (
    <style>{`
        .admin-md p { margin: 0 0 6px; }
        .admin-md p:last-child { margin: 0; }
        .admin-md h1, .admin-md h2, .admin-md h3 { font-size: 14px; font-weight: 700; margin: 8px 0 4px; }
        .admin-md ul, .admin-md ol { margin: 4px 0; padding-left: 18px; }
        .admin-md li { margin: 2px 0; }
        .admin-md strong { font-weight: 700; }
        .admin-md em { font-style: italic; }
        .admin-md hr { border: none; border-top: 1px solid #e2e8f0; margin: 8px 0; }
        .admin-md code { background: #e2e8f0; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
        .admin-md pre { background: #1e293b; color: #e2e8f0; padding: 10px; border-radius: 8px; overflow-x: auto; font-size: 12px; }
        .admin-md blockquote { border-left: 3px solid #6366f1; margin: 4px 0; padding: 4px 10px; color: #64748b; }
    `}</style>
)
