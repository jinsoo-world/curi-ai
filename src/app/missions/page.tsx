'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import AppSidebar from '@/components/AppSidebar'
import { createClient } from '@/lib/supabase/client'

interface MissionItem {
    id: string
    icon: string
    title: string
    description: string
    reward: number
    rewardLabel: string
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
    const [creditHistory, setCreditHistory] = useState<any[]>([])
    const [missionStatus, setMissionStatus] = useState({
        aiCreated: 0,
        questionsAsked: 0,
        friendsInvited: 0,
        friendClovers: 0,
        sharesToday: 0,
        profileUpdated: false,
        cloverHuntToday: 0,
    })
    const [copied, setCopied] = useState(false)
    const [showInviteModal, setShowInviteModal] = useState(false)
    const [referralCode, setReferralCode] = useState('')

    // 클로버 애니메이션
    const [cloverAnim, setCloverAnim] = useState<{ show: boolean; amount: number; label: string }>({
        show: false, amount: 0, label: '',
    })

    const showCloverAnimation = useCallback((amount: number, label: string) => {
        setCloverAnim({ show: true, amount, label })
        setTimeout(() => setCloverAnim({ show: false, amount: 0, label: '' }), 2500)
    }, [])

    // 공유 처리
    const [sharing, setSharing] = useState(false)

    useEffect(() => {
        const supabase = createClient()
        const fetchData = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            setUser(user)

            if (user) {
                try {
                    const res = await fetch('/api/missions/status')
                    const data = await res.json()
                    if (data.ok) {
                        setMissionStatus({
                            aiCreated: Math.min(data.aiCreated || 0, 2),
                            questionsAsked: Math.min(data.questionsAsked || 0, 10),
                            friendsInvited: data.friendsInvited || 0,
                            friendClovers: (data.friendsInvited || 0) * 10,
                            sharesToday: data.sharesToday || 0,
                            profileUpdated: data.profileUpdated || false,
                            cloverHuntToday: data.cloverHuntToday || 0,
                        })
                        setClovers(data.clovers || 0)
                        setCreditHistory(data.creditHistory || [])
                        if (data.referralCode) setReferralCode(data.referralCode)
                    }
                } catch (err) {
                    console.error('Mission status error:', err)
                }

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

    // URL 파라미터로 보상 애니메이션 트리거 (AI 만들기 완료 후 etc)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const rewardType = params.get('reward_earned')
        const amount = parseInt(params.get('amount') || '0')
        if (rewardType && amount > 0) {
            const labels: Record<string, string> = {
                ai_create: '🤖 내 AI 만들기 완료!',
                questions_10: '💬 10번 질문 미션 완료!',
                profile_update: '👤 마이페이지 업데이트 완료!',
            }
            setTimeout(() => {
                showCloverAnimation(amount, labels[rewardType] || '미션 완료!')
            }, 500)
            // URL에서 파라미터 제거
            window.history.replaceState({}, '', '/missions')
        }
    }, [showCloverAnimation])

    const inviteLink = `https://www.curi-ai.com/?ref=${referralCode || 'curi'}`


    const handleCopyInviteLink = () => {
        navigator.clipboard.writeText(inviteLink).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    // 공유 확인 모달
    const [showShareConfirm, setShowShareConfirm] = useState(false)

    // 카톡 공유 + 확인 후 클로버 적립
    const handleShare = async () => {
        if (sharing || missionStatus.sharesToday >= 3) return

        // 공유 창 열기
        const shareText = '큐리 AI에서 나만의 AI 멘토를 만들어보세요! 🤖'
        const shareUrl = inviteLink

        try {
            if (navigator.share) {
                await navigator.share({
                    title: '큐리 AI',
                    text: shareText,
                    url: shareUrl,
                })
                // Web Share API는 공유 완료 시 resolve → 바로 적립
                await confirmShare()
            } else {
                // 데스크톱: 카카오 SDK로 공유
                const w = window as any
                if (w.Kakao && !w.Kakao.isInitialized()) {
                    w.Kakao.init('27c5c27a03c6f936db39d20090643b3c')
                }
                if (w.Kakao && w.Kakao.isInitialized()) {
                    w.Kakao.Share.sendDefault({
                        objectType: 'feed',
                        content: {
                            title: '큐리 AI',
                            description: shareText,
                            imageUrl: 'https://www.curi-ai.com/icons/icon-512x512.png',
                            link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
                        },
                        buttons: [
                            { title: '시작하기', link: { mobileWebUrl: shareUrl, webUrl: shareUrl } },
                        ],
                    })
                } else {
                    await navigator.clipboard.writeText(shareUrl)
                    alert('링크가 복사되었습니다. 카카오톡에 붙여넣기 해주세요!')
                }
                setShowShareConfirm(true)
            }
        } catch (err) {
            // 사용자가 공유 취소한 경우 — 적립 안함
            console.log('Share cancelled:', err)
        }
    }

    const confirmShare = async () => {
        setSharing(true)
        setShowShareConfirm(false)
        try {
            const res = await fetch('/api/missions/share', { method: 'POST' })
            const data = await res.json()
            if (data.ok) {
                setClovers(data.clovers)
                setMissionStatus(prev => ({ ...prev, sharesToday: data.sharesToday }))
                showCloverAnimation(10, '친구에게 공유 완료!')
            } else if (data.error) {
                alert(data.error)
            }
        } catch (err) {
            console.error('Share confirm error:', err)
        }
        setSharing(false)
    }

    const missions: MissionItem[] = [
        {
            id: 'ask-10',
            icon: '💬',
            title: '10번 질문하기',
            description: 'AI에게 10번 대화해보세요',
            reward: 30,
            rewardLabel: '🍀 +30',
            progress: missionStatus.questionsAsked,
            goal: 10,
            completed: missionStatus.questionsAsked >= 10,
            action: () => window.location.href = '/mentors',
            actionLabel: '대화하기',
        },
        {
            id: 'create-ai',
            icon: '🤖',
            title: '내 AI 만들어보기',
            description: '1개당 25클로버 (최대 2개)',
            reward: 25,
            rewardLabel: '🍀 +25/개',
            progress: missionStatus.aiCreated,
            goal: 2,
            completed: missionStatus.aiCreated >= 2,
            action: () => window.location.href = '/creator/create',
            actionLabel: 'AI 만들기',
        },
        {
            id: 'invite-friend',
            icon: '🎉',
            title: '친구 초대하기',
            description: '친구 1명이 가입하면 10클로버!',
            reward: 10,
            rewardLabel: '🍀 +10',
            progress: missionStatus.friendsInvited,
            goal: 1,
            completed: missionStatus.friendsInvited >= 1,
            action: () => setShowInviteModal(true),
            actionLabel: '초대하기',
        },
        {
            id: 'profile-update',
            icon: '👤',
            title: '마이페이지 업데이트',
            description: '마이페이지에서 프로필을 업데이트하세요',
            reward: 30,
            rewardLabel: '🍀 +30',
            progress: missionStatus.profileUpdated ? 1 : 0,
            goal: 1,
            completed: missionStatus.profileUpdated,
            action: () => window.location.href = '/profile',
            actionLabel: '마이페이지',
        },
    ]

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
                    @keyframes cloverFloat {
                        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                        15% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                        30% { transform: translate(-50%, -55%) scale(1); }
                        80% { opacity: 1; transform: translate(-50%, -70%) scale(1); }
                        100% { opacity: 0; transform: translate(-50%, -90%) scale(0.8); }
                    }
                    @keyframes cloverPulse {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.15); }
                    }
                    @keyframes sparkle {
                        0% { opacity: 0; transform: scale(0) rotate(0deg); }
                        50% { opacity: 1; transform: scale(1) rotate(180deg); }
                        100% { opacity: 0; transform: scale(0) rotate(360deg); }
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
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 2 }}>총 적립</div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#16a34a' }}>
                                        +{creditHistory.filter((c: any) => c.amount > 0).reduce((s: number, c: any) => s + c.amount, 0)}
                                    </div>
                                </div>
                            </div>

                            {/* 🍀 오늘의 네잎클로버 카드 */}
                            <div style={{
                                background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
                                borderRadius: 16,
                                border: '1.5px solid #a7f3d0',
                                padding: '20px 24px',
                                marginBottom: 20,
                                animation: 'fadeIn 0.3s ease',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: 28 }}>🍀</span>
                                        <div>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: '#15803d' }}>오늘의 네잎클로버</div>
                                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>행운을 가져다주는 네잎클로버를 찾아보세요!</div>
                                        </div>
                                    </div>
                                    <div style={{
                                        fontSize: 14, fontWeight: 700,
                                        color: missionStatus.cloverHuntToday >= 3 ? '#16a34a' : '#374151',
                                    }}>
                                        {missionStatus.cloverHuntToday}/3
                                    </div>
                                </div>
                                {/* 프로그레스 바 */}
                                <div style={{
                                    height: 8, borderRadius: 4,
                                    background: 'rgba(0,0,0,0.06)',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{
                                        height: '100%', borderRadius: 4,
                                        background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                                        width: `${Math.min((missionStatus.cloverHuntToday / 3) * 100, 100)}%`,
                                        transition: 'width 0.5s ease',
                                    }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#9ca3af' }}>
                                    <span>발견당 🍀 +10 클로버</span>
                                    <span>10분 체류 시 5개까지!</span>
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
                                                {mission.rewardLabel}
                                            </div>
                                            {mission.completed ? (
                                                mission.id === 'share' ? (
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af' }}>오늘 완료</span>
                                                ) : (
                                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>완료!</span>
                                                )
                                            ) : (
                                                <button
                                                    onClick={mission.action}
                                                    disabled={mission.id === 'share' && sharing}
                                                    style={{
                                                        padding: '8px 16px', borderRadius: 10, border: 'none',
                                                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                                        color: '#fff', fontSize: 13, fontWeight: 600,
                                                        cursor: 'pointer', transition: 'transform 150ms', whiteSpace: 'nowrap',
                                                        opacity: (mission.id === 'share' && sharing) ? 0.6 : 1,
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

                            {/* 클로버 이력 */}
                            <div style={{
                                marginTop: 24, background: '#fff', borderRadius: 16,
                                border: '1px solid #f0f0f0', padding: '20px 24px',
                                animation: 'fadeIn 0.6s ease',
                            }}>
                                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#18181b', marginBottom: 16, margin: '0 0 16px' }}>
                                    📜 클로버 이력
                                </h3>
                                {creditHistory.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af', fontSize: 14 }}>
                                        아직 이력이 없어요. 미션을 완료하면 클로버가 적립돼요! 🍀
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                                        {creditHistory.map((credit: any, idx: number) => {
                                            const isEarned = credit.amount > 0
                                            const date = new Date(credit.created_at)
                                            const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
                                            const typeLabels: Record<string, string> = {
                                                welcome_bonus: '🎉 웰컴 보너스',
                                                mission_create_ai: '🤖 AI 만들기 미션',
                                                mission_create_ai_1: '🤖 AI 1개 만들기',
                                                mission_create_ai_2: '🤖 AI 2개 만들기',
                                                mission_ask_10: '💬 10번 질문 미션',
                                                mission_invite: '🎉 친구 초대 미션',
                                                mission_share: '📤 공유 미션',
                                                mission_profile_update: '👤 마이페이지 업데이트',
                                                purchase: '💳 충전',
                                                usage: '🛒 사용',
                                                refund: '↩️ 환불',
                                            }
                                            return (
                                                <div
                                                    key={credit.id || idx}
                                                    style={{
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                        padding: '12px 0',
                                                        borderBottom: idx < creditHistory.length - 1 ? '1px solid #f5f5f5' : 'none',
                                                    }}
                                                >
                                                    <div>
                                                        <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>
                                                            {typeLabels[credit.type] || credit.description || credit.type}
                                                        </div>
                                                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                                                            {dateStr}
                                                        </div>
                                                    </div>
                                                    <div style={{
                                                        fontSize: 15, fontWeight: 700,
                                                        color: isEarned ? '#16a34a' : '#ef4444',
                                                    }}>
                                                        {isEarned ? '+' : ''}{credit.amount} 🍀
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

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

            {/* 클로버 획득 애니메이션 오버레이 */}
            {cloverAnim.show && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 9999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(6px)',
                    animation: 'fadeIn 0.3s ease',
                }}>
                    <div style={{
                        background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                        borderRadius: 28,
                        padding: '48px 56px',
                        textAlign: 'center',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.2), 0 0 80px rgba(34,197,94,0.3)',
                        animation: 'cloverPulse 0.6s ease-in-out',
                        border: '2px solid #bbf7d0',
                    }}>
                        <div style={{
                            fontSize: 80,
                            animation: 'cloverPulse 0.5s ease-in-out 3',
                            filter: 'drop-shadow(0 4px 20px rgba(34,197,94,0.5))',
                            marginBottom: 12,
                        }}>
                            🍀
                        </div>
                        <div style={{
                            fontSize: 36, fontWeight: 900,
                            color: '#15803d',
                            letterSpacing: '-0.02em',
                            marginBottom: 8,
                        }}>
                            +{cloverAnim.amount} 클로버!
                        </div>
                        <div style={{
                            fontSize: 18, fontWeight: 600,
                            color: '#16a34a',
                            marginBottom: 4,
                        }}>
                            {cloverAnim.label}
                        </div>
                        <div style={{
                            fontSize: 13, color: '#6b7280', marginTop: 12,
                        }}>
                            잠시 후 자동으로 닫힙니다
                        </div>
                    </div>
                </div>
            )}

            {/* 공유 확인 모달 */}
            {showShareConfirm && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', padding: 24,
                }}>
                    <div style={{
                        background: '#fff', borderRadius: 20,
                        padding: '32px 28px', maxWidth: 380, width: '100%',
                        textAlign: 'center', position: 'relative',
                        animation: 'fadeIn 0.3s ease',
                    }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>📤</div>
                        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#18181b', marginBottom: 8 }}>
                            공유를 완료했나요?
                        </h3>
                        <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
                            친구에게 공유를 완료하셨으면<br />아래 버튼을 눌러 클로버를 받으세요! 🍀
                        </p>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={() => setShowShareConfirm(false)}
                                style={{
                                    flex: 1, padding: '14px', borderRadius: 12,
                                    border: '1px solid #e5e7eb', background: '#f9fafb',
                                    fontSize: 14, fontWeight: 600, color: '#6b7280',
                                    cursor: 'pointer',
                                }}
                            >
                                아직 안 했어요
                            </button>
                            <button
                                onClick={confirmShare}
                                style={{
                                    flex: 1, padding: '14px', borderRadius: 12,
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    fontSize: 14, fontWeight: 600, color: '#fff',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                                }}
                            >
                                🍀 공유 완료!
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                            친구가 가입할 때 🍀 10 클로버를 받아요!
                        </p>

                        {/* 초대 링크 */}
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: '#f4f4f5', borderRadius: 12,
                            padding: '12px 14px', marginBottom: 12,
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

                        {/* 카카오톡 공유 버튼 */}
                        <button
                            onClick={async () => {
                                const w = window as any
                                // SDK 동적 로딩 보장
                                const ensureKakao = (): Promise<boolean> => new Promise((resolve) => {
                                    if (w.Kakao) {
                                        if (!w.Kakao.isInitialized()) w.Kakao.init('27c5c27a03c6f936db39d20090643b3c')
                                        resolve(true)
                                        return
                                    }
                                    // SDK가 아직 없으면 동적 로드
                                    const s = document.createElement('script')
                                    s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js'
                                    s.onload = () => {
                                        if (w.Kakao && !w.Kakao.isInitialized()) w.Kakao.init('27c5c27a03c6f936db39d20090643b3c')
                                        resolve(!!w.Kakao)
                                    }
                                    s.onerror = () => resolve(false)
                                    document.head.appendChild(s)
                                })

                                let shared = false
                                try {
                                    const ready = await ensureKakao()
                                    if (ready) {
                                        const shareParams = {
                                            objectType: 'feed' as const,
                                            content: {
                                                title: '큐리 AI - 나만의 AI 멘토',
                                                description: '24시간 대화할 수 있는 AI 멘토를 만나보세요! 🤖✨',
                                                imageUrl: 'https://www.curi-ai.com/icons/icon-512x512.png',
                                                link: { mobileWebUrl: inviteLink, webUrl: inviteLink },
                                            },
                                            buttons: [
                                                { title: '큐리 AI 시작하기', link: { mobileWebUrl: inviteLink, webUrl: inviteLink } },
                                            ],
                                        }
                                        if (w.Kakao?.Share?.sendDefault) {
                                            w.Kakao.Share.sendDefault(shareParams)
                                            shared = true
                                        } else if (w.Kakao?.Link?.sendDefault) {
                                            w.Kakao.Link.sendDefault(shareParams)
                                            shared = true
                                        }
                                    }
                                } catch (e) {
                                    console.error('[Kakao Share]', e)
                                }
                                if (shared) {
                                    setShowInviteModal(false)
                                    setShowShareConfirm(true)
                                } else {
                                    // 폴백: 클립보드 복사
                                    try { await navigator.clipboard.writeText(inviteLink) } catch {}
                                    setCopied(true)
                                    setTimeout(() => setCopied(false), 2000)
                                    alert('초대 링크가 복사되었어요! 💛\n카카오톡에 붙여넣기 해주세요.')
                                }
                            }}
                            disabled={sharing}
                            style={{
                                width: '100%',
                                padding: '14px 20px',
                                borderRadius: 12,
                                border: 'none',
                                background: '#FEE500',
                                color: '#191919',
                                fontSize: 15,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                transition: 'transform 150ms, box-shadow 150ms',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                marginBottom: 8,
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.transform = 'translateY(-1px)'
                                e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.12)'
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.transform = 'translateY(0)'
                                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                <path d="M9 1C4.58 1 1 3.87 1 7.35c0 2.21 1.47 4.15 3.68 5.24L4.2 15.5c-.06.23.2.41.4.28l3.27-2.07c.37.04.75.06 1.13.06 4.42 0 8-2.87 8-6.35S13.42 1 9 1z" fill="#191919"/>
                            </svg>
                            카카오톡으로 공유하기
                        </button>
                        <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 0' }}>
                            공유하면 🍀 10클로버를 받아요!
                        </p>                        {/* 초대 현황 */}
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
