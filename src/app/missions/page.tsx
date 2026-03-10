'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppSidebar from '@/components/AppSidebar'
import { createClient } from '@/lib/supabase/client'

interface MissionItem {
    id: string
    icon: string
    title: string
    description: string
    reward: number
    progress: number
    goal: number
    completed: boolean
    action: () => void
    actionLabel: string
}

export default function MissionsPage() {
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [clovers, setClovers] = useState(0)
    const [missionStatus, setMissionStatus] = useState({
        aiCreated: 0,
        questionsAsked: 0,
        friendsInvited: 0,
        friendClovers: 0,
    })
    const [copied, setCopied] = useState(false)
    const [showInviteModal, setShowInviteModal] = useState(false)
    const [referralCode, setReferralCode] = useState('')

    useEffect(() => {
        const supabase = createClient()
        const fetchData = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            setUser(user)

            if (user) {
                // 서버 API로 미션 진행 상황 조회 (RLS 우회)
                try {
                    const res = await fetch('/api/missions/status')
                    const data = await res.json()
                    if (data.ok) {
                        setMissionStatus({
                            aiCreated: Math.min(data.aiCreated || 0, 2),
                            questionsAsked: Math.min(data.questionsAsked || 0, 10),
                            friendsInvited: data.friendsInvited || 0,
                            friendClovers: (data.friendsInvited || 0) * 100,
                        })
                        setClovers(data.clovers || 0)
                        if (data.referralCode) setReferralCode(data.referralCode)
                    }
                } catch (err) {
                    console.error('Mission status error:', err)
                }

                // referral_code 없으면 생성 요청
                if (!referralCode) {
                    try {
                        const res = await fetch('/api/referral', { method: 'POST' })
                        const data = await res.json()
                        if (data.referral_code) setReferralCode(data.referral_code)
                    } catch {}
                }
            }
            setLoading(false)
        }
        fetchData()
    }, [])

    const inviteLink = `https://app-seven-delta-90.vercel.app/?ref=${referralCode || 'curi'}`

    const handleCopyInviteLink = () => {
        navigator.clipboard.writeText(inviteLink).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    const missions: MissionItem[] = [
        {
            id: 'create-ai',
            icon: '🤖',
            title: '내 AI 만들어보기',
            description: 'AI를 2개 만들어보세요',
            reward: 50,
            progress: missionStatus.aiCreated,
            goal: 2,
            completed: missionStatus.aiCreated >= 2,
            action: () => window.location.href = '/creator/create',
            actionLabel: 'AI 만들기',
        },
        {
            id: 'ask-10',
            icon: '💬',
            title: '10번 질문하기',
            description: 'AI에게 10번 대화해보세요',
            reward: 30,
            progress: missionStatus.questionsAsked,
            goal: 10,
            completed: missionStatus.questionsAsked >= 10,
            action: () => window.location.href = '/mentors',
            actionLabel: '대화하기',
        },
        {
            id: 'invite-friend',
            icon: '🎉',
            title: '친구 초대하기',
            description: '친구 1명이 가입하면 100클로버!',
            reward: 100,
            progress: missionStatus.friendsInvited,
            goal: 1,
            completed: missionStatus.friendsInvited >= 1,
            action: () => setShowInviteModal(true),
            actionLabel: '초대하기',
        },
    ]

    const totalEarned = missions.filter(m => m.completed).reduce((s, m) => s + m.reward, 0)

    return (
        <>
            <AppSidebar />
            <main style={{
                marginLeft: 240,
                minHeight: '100dvh',
                background: '#fafafa',
                padding: '32px 24px 80px',
            }}>
                <style>{`
                    @media (max-width: 768px) {
                        main { margin-left: 0 !important; padding-top: 64px !important; }
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>

                <div style={{ maxWidth: 680, margin: '0 auto' }}>
                    {/* 헤더 */}
                    <div style={{ marginBottom: 28, animation: 'fadeIn 0.4s ease' }}>
                        <h1 style={{
                            fontSize: 24, fontWeight: 800, color: '#18181b',
                            letterSpacing: '-0.03em', margin: 0,
                        }}>
                            🍀 미션 보상
                        </h1>
                        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
                            미션을 완료하고 클로버를 모아보세요!
                        </p>
                    </div>

                    {/* 비로그인 */}
                    {!loading && !user && (
                        <div style={{
                            textAlign: 'center', padding: '60px 20px',
                            background: '#fff', borderRadius: 20,
                            border: '1px solid #f0f0f0',
                            animation: 'fadeIn 0.4s ease',
                        }}>
                            <div style={{ fontSize: 56, marginBottom: 16 }}>🔐</div>
                            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#18181b', marginBottom: 8 }}>
                                로그인이 필요합니다
                            </h2>
                            <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
                                미션을 수행하고 클로버를 모으려면<br />먼저 로그인해주세요!
                            </p>
                            <Link href="/login" style={{
                                display: 'inline-block', padding: '14px 32px', borderRadius: 14,
                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 16,
                                boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                            }}>
                                🚀 로그인하기
                            </Link>
                        </div>
                    )}

                    {/* 로딩 */}
                    {loading && (
                        <div style={{ textAlign: 'center', padding: 60 }}>
                            <div style={{
                                width: 40, height: 40,
                                border: '3px solid #e5e7eb', borderTopColor: '#22c55e',
                                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                                margin: '0 auto',
                            }} />
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                        </div>
                    )}

                    {/* 로그인 후 — 미션 */}
                    {!loading && user && (
                        <div style={{ animation: 'fadeIn 0.4s ease' }}>
                            {/* 클로버 잔고 */}
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                                border: '1.5px solid #bbf7d0', borderRadius: 16,
                                padding: '18px 24px', marginBottom: 20,
                            }}>
                                <div>
                                    <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>내 클로버</div>
                                    <div style={{ fontSize: 28, fontWeight: 800, color: '#15803d', letterSpacing: '-0.02em' }}>
                                        🍀 {clovers.toLocaleString()}
                                    </div>
                                </div>
                                <div style={{
                                    background: '#fff', borderRadius: 12,
                                    padding: '10px 16px', border: '1px solid #dcfce7',
                                }}>
                                    <div style={{ fontSize: 11, color: '#9ca3af' }}>미션 보상</div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>
                                        🍀 {totalEarned}
                                    </div>
                                </div>
                            </div>

                            {/* 미션 카드 */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {missions.map((mission, idx) => (
                                    <div
                                        key={mission.id}
                                        style={{
                                            background: '#fff', borderRadius: 16,
                                            border: mission.completed ? '1.5px solid #bbf7d0' : '1px solid #f0f0f0',
                                            padding: '20px 24px',
                                            display: 'flex', alignItems: 'center', gap: 16,
                                            animation: `fadeIn ${0.3 + idx * 0.1}s ease`,
                                            transition: 'border-color 200ms, box-shadow 200ms',
                                        }}
                                    >
                                        {/* 아이콘 */}
                                        <div style={{
                                            width: 52, height: 52, borderRadius: 14,
                                            background: mission.completed
                                                ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)' : '#f4f4f5',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 26, flexShrink: 0,
                                        }}>
                                            {mission.completed ? '✅' : mission.icon}
                                        </div>

                                        {/* 내용 */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: '#18181b', marginBottom: 2 }}>
                                                {mission.title}
                                            </div>
                                            <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>
                                                {mission.description}
                                            </div>
                                            {/* 진행바 */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#f0f0f0', overflow: 'hidden' }}>
                                                    <div style={{
                                                        height: '100%',
                                                        width: `${Math.min((mission.progress / mission.goal) * 100, 100)}%`,
                                                        borderRadius: 3,
                                                        background: mission.completed
                                                            ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                                                            : 'linear-gradient(90deg, #60a5fa, #3b82f6)',
                                                        transition: 'width 500ms ease',
                                                    }} />
                                                </div>
                                                <span style={{
                                                    fontSize: 12, fontWeight: 600,
                                                    color: mission.completed ? '#16a34a' : '#6b7280',
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {mission.progress}/{mission.goal}
                                                </span>
                                            </div>
                                        </div>

                                        {/* 보상/버튼 */}
                                        <div style={{
                                            display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', gap: 6, flexShrink: 0,
                                        }}>
                                            <div style={{
                                                fontSize: 12, fontWeight: 600, color: '#16a34a',
                                                background: '#f0fdf4', borderRadius: 8, padding: '3px 10px',
                                            }}>
                                                🍀 +{mission.reward}
                                            </div>
                                            {mission.completed ? (
                                                <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>완료!</span>
                                            ) : (
                                                <button
                                                    onClick={mission.action}
                                                    style={{
                                                        padding: '8px 16px', borderRadius: 10, border: 'none',
                                                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                                        color: '#fff', fontSize: 13, fontWeight: 600,
                                                        cursor: 'pointer', transition: 'transform 150ms', whiteSpace: 'nowrap',
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                                >
                                                    {mission.actionLabel}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* 친구 초대 적립 내역 */}
                            {missionStatus.friendsInvited > 0 && (
                                <div style={{
                                    marginTop: 16,
                                    background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                                    border: '1.5px solid #fde68a',
                                    borderRadius: 14,
                                    padding: '16px 20px',
                                    animation: 'fadeIn 0.5s ease',
                                }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>
                                        🎉 {missionStatus.friendsInvited}명의 친구가 새로 가입했어요!
                                    </div>
                                    <div style={{ fontSize: 13, color: '#a16207' }}>
                                        🍀 {missionStatus.friendClovers}클로버가 적립되었어요
                                    </div>
                                </div>
                            )}

                            {/* 클로버 안내 */}
                            <div style={{
                                marginTop: 24, background: '#fff', borderRadius: 16,
                                border: '1px solid #f0f0f0', padding: '20px 24px',
                                animation: 'fadeIn 0.6s ease',
                            }}>
                                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#18181b', marginBottom: 8, margin: 0 }}>
                                    🍀 클로버란?
                                </h3>
                                <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.7, margin: '8px 0 0' }}>
                                    클로버는 큐리 AI에서 미션을 수행하면 받을 수 있는 보상이에요.<br />
                                    모은 클로버로 프리미엄 기능, 이모티콘, 기프티콘 등<br />
                                    다양한 혜택과 교환할 수 있습니다! 🎁
                                </p>
                                <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                                    <Link href="/store" style={{
                                        flex: 1, textAlign: 'center',
                                        padding: '12px 14px',
                                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                        borderRadius: 10, fontSize: 14, fontWeight: 600,
                                        color: '#fff', textDecoration: 'none',
                                        boxShadow: '0 2px 8px rgba(34,197,94,0.3)',
                                    }}>
                                        🎁 클로버 스토어 바로가기
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* 친구 초대 모달 */}
            {showInviteModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', padding: 24,
                }}>
                    <div style={{
                        background: '#fff', borderRadius: 20,
                        padding: '32px 28px', maxWidth: 400, width: '100%',
                        textAlign: 'center', position: 'relative',
                        animation: 'fadeIn 0.3s ease',
                    }}>
                        <button
                            onClick={() => setShowInviteModal(false)}
                            style={{
                                position: 'absolute', top: 14, right: 14,
                                width: 32, height: 32, borderRadius: '50%',
                                background: 'rgba(0,0,0,0.06)', border: 'none',
                                fontSize: 16, color: '#6b7280', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            ✕
                        </button>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#18181b', marginBottom: 6 }}>
                            친구 초대하기
                        </h3>
                        <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>
                            아래 링크를 친구에게 공유하면<br />
                            친구가 가입할 때 🍀 100 클로버를 받아요!
                        </p>

                        {/* 초대 링크 */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: '#f4f4f5', borderRadius: 12,
                            padding: '12px 14px', marginBottom: 16,
                        }}>
                            <input
                                readOnly
                                value={inviteLink}
                                style={{
                                    flex: 1, border: 'none', background: 'transparent',
                                    fontSize: 13, color: '#374151', outline: 'none',
                                    overflow: 'hidden', textOverflow: 'ellipsis',
                                }}
                            />
                            <button
                                onClick={handleCopyInviteLink}
                                style={{
                                    padding: '8px 16px', borderRadius: 8, border: 'none',
                                    background: copied ? '#16a34a' : '#22c55e',
                                    color: '#fff', fontSize: 13, fontWeight: 600,
                                    cursor: 'pointer', whiteSpace: 'nowrap',
                                    transition: 'background 200ms',
                                }}
                            >
                                {copied ? '✓ 복사됨' : '링크 복사'}
                            </button>
                        </div>

                        {/* 카카오톡 공유 */}
                        <button
                            onClick={() => {
                                window.open(
                                    `https://sharer.kakao.com/talk/friends/picker/link?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('나만의 AI를 만들어보세요! 🤖')}`,
                                    '_blank'
                                )
                            }}
                            style={{
                                width: '100%', padding: '12px', borderRadius: 10,
                                border: '1px solid #FEE500', background: '#FEE500',
                                fontSize: 14, fontWeight: 600, color: '#3C1E1E',
                                cursor: 'pointer', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', gap: 8,
                            }}
                        >
                            💬 카카오톡으로 공유하기
                        </button>

                        {/* 초대 현황 */}
                        {missionStatus.friendsInvited > 0 && (
                            <div style={{
                                marginTop: 16, padding: '12px 16px',
                                background: '#f0fdf4', borderRadius: 10,
                                border: '1px solid #bbf7d0',
                            }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>
                                    🎉 {missionStatus.friendsInvited}명의 친구가 가입했어요!
                                </div>
                                <div style={{ fontSize: 12, color: '#16a34a', marginTop: 2 }}>
                                    🍀 총 {missionStatus.friendClovers}클로버 적립됨
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
