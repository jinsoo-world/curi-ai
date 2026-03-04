'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

import { MembershipBanner } from '@/components/MembershipBanner'
import Image from 'next/image'

const PLANS = {
    monthly: { price: 9900, label: '월간', period: '월', badge: '' },
    annual: { price: 99000, label: '연간', period: '년', badge: '17% 할인', monthly: 8250 },
}

const FREE_FEATURES = [
    '하루 5회 무료 대화',
    '5명의 AI 멘토',
    '텍스트 채팅',
]

const PREMIUM_FEATURES = [
    '무제한 대화',
    '모든 AI 멘토 접근',
    '텍스트 + 음성 멘토링',
    '대화 내역 무제한 저장',
    '우선 응답 속도',
    '신규 멘토 우선 제공',
]

export default function PricingPage() {
    const router = useRouter()
    const supabase = createClient()
    const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'annual'>('monthly')
    const [loading, setLoading] = useState(false)
    const [userId, setUserId] = useState<string | null>(null)
    const [isPremium, setIsPremium] = useState(false)

    useEffect(() => {
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                setUserId(user.id)
                const { data: profile } = await supabase
                    .from('users')
                    .select('subscription_tier')
                    .eq('id', user.id)
                    .single()
                if (profile?.subscription_tier === 'premium') {
                    setIsPremium(true)
                }
            }
        }
        checkUser()
    }, [])

    const handleSubscribe = async () => {
        if (!userId) {
            router.push('/login?redirect=/pricing')
            return
        }

        if (isPremium) return

        setLoading(true)
        try {
            const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk')
            const tossPayments = await loadTossPayments(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!)
            const payment = tossPayments.payment({ customerKey: userId })

            await payment.requestBillingAuth({
                method: 'CARD',
                successUrl: `${window.location.origin}/billing/success?planType=${selectedPlan}`,
                failUrl: `${window.location.origin}/billing/fail`,
                customerEmail: undefined,
                customerName: undefined,
            })
        } catch (error) {
            console.error('결제 요청 오류:', error)
            setLoading(false)
        }
    }

    const plan = PLANS[selectedPlan]

    return (
        <main style={{
            minHeight: '100dvh',
            background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 40%)',
        }}>
            <MembershipBanner />

            {/* GNB Header */}
            <header style={{
                position: 'sticky', top: 0, zIndex: 50,
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderBottom: '1px solid #f0f0f0',
            }}>
                <div style={{
                    maxWidth: 1200, margin: '0 auto',
                    padding: '0 40px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    height: 64,
                }}>
                    <Link href="/mentors" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                        <Image src="/curilogo.png" alt="큐리 AI" width={32} height={32} />
                        <span style={{
                            fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em',
                            background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            큐리 AI
                        </span>
                    </Link>
                    <nav style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                        {[
                            { label: '멘토', href: '/mentors', active: false },
                            { label: '대화', href: '/chats', active: false },
                            { label: '✨ 프리미엄', href: '/pricing', active: true },
                            { label: '마이페이지', href: '/profile', active: false },
                        ].map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                style={{
                                    textDecoration: 'none',
                                    fontSize: 16, fontWeight: item.active ? 700 : 500,
                                    color: item.active ? '#f59e0b' : '#9ca3af',
                                    transition: 'color 200ms',
                                    borderBottom: item.active ? '2px solid #f59e0b' : '2px solid transparent',
                                    paddingBottom: 4,
                                }}
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>
                </div>
            </header>

            {/* Content */}
            <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 48px' }}>

                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <h1 style={{
                        fontSize: 28, fontWeight: 800, color: '#18181b',
                        margin: '0 0 8px',
                    }}>
                        프리미엄 멘토링
                    </h1>
                    <p style={{ fontSize: 16, color: '#6b7280', margin: 0 }}>
                        무제한 대화로 성장을 가속화하세요
                    </p>
                </div>

                {/* Plan Toggle */}
                <div style={{
                    display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 32,
                    background: '#f4f4f5', borderRadius: 12, padding: 4, maxWidth: 240, margin: '0 auto 32px',
                }}>
                    {(['monthly', 'annual'] as const).map(type => (
                        <button
                            key={type}
                            onClick={() => setSelectedPlan(type)}
                            style={{
                                flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
                                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                background: selectedPlan === type ? '#fff' : 'transparent',
                                color: selectedPlan === type ? '#18181b' : '#71717a',
                                boxShadow: selectedPlan === type ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                                transition: 'all 0.2s',
                                position: 'relative',
                            }}
                        >
                            {PLANS[type].label}
                            {PLANS[type].badge && (
                                <span style={{
                                    position: 'absolute', top: -8, right: -4,
                                    background: '#22c55e', color: '#fff',
                                    fontSize: 10, fontWeight: 700, padding: '2px 6px',
                                    borderRadius: 20,
                                }}>
                                    {PLANS[type].badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Pricing Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Free Card */}
                    <div style={{
                        background: '#fff', borderRadius: 20, padding: 24,
                        border: '1px solid #e4e4e7',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', margin: 0 }}>Free</h3>
                            <span style={{ fontSize: 24, fontWeight: 800, color: '#18181b' }}>₩0</span>
                        </div>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {FREE_FEATURES.map((f, i) => (
                                <li key={i} style={{ fontSize: 14, color: '#52525b', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ color: '#a1a1aa' }}>✓</span> {f}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Premium Card */}
                    <div style={{
                        background: 'linear-gradient(135deg, #18181b 0%, #27272a 100%)',
                        borderRadius: 20, padding: 24, color: '#fff',
                        border: '2px solid #22c55e',
                        position: 'relative', overflow: 'hidden',
                    }}>
                        {/* Glow effect */}
                        <div style={{
                            position: 'absolute', top: -40, right: -40, width: 120, height: 120,
                            background: 'radial-gradient(circle, rgba(34,197,94,0.3) 0%, transparent 70%)',
                        }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, position: 'relative' }}>
                            <div>
                                <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>
                                    ✨ Premium
                                </h3>
                                {isPremium && (
                                    <span style={{
                                        fontSize: 11, background: '#22c55e', color: '#fff',
                                        padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                                    }}>
                                        현재 구독 중
                                    </span>
                                )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: 28, fontWeight: 800 }}>
                                    ₩{plan.price.toLocaleString()}
                                </span>
                                <span style={{ fontSize: 14, color: '#a1a1aa' }}>/{plan.period}</span>
                                {selectedPlan === 'annual' && (
                                    <div style={{ fontSize: 12, color: '#22c55e', marginTop: 2 }}>
                                        월 ₩{PLANS.annual.monthly?.toLocaleString()}
                                    </div>
                                )}
                            </div>
                        </div>

                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
                            {PREMIUM_FEATURES.map((f, i) => (
                                <li key={i} style={{ fontSize: 14, color: '#e4e4e7', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ color: '#22c55e' }}>✓</span> {f}
                                </li>
                            ))}
                        </ul>

                        <button
                            onClick={handleSubscribe}
                            disabled={loading || isPremium}
                            style={{
                                width: '100%', padding: '14px 24px', borderRadius: 12,
                                border: 'none', fontSize: 16, fontWeight: 700,
                                cursor: loading || isPremium ? 'default' : 'pointer',
                                background: isPremium ? '#52525b' : '#22c55e',
                                color: '#fff',
                                opacity: loading ? 0.7 : 1,
                                transition: 'all 0.2s',
                                position: 'relative',
                            }}
                        >
                            {loading ? '처리 중...' :
                                isPremium ? '구독 중' :
                                    !userId ? '로그인 후 구독하기' :
                                        '프리미엄 시작하기'}
                        </button>
                    </div>
                </div>

                {/* FAQ */}
                <div style={{ marginTop: 40 }}>
                    <h3 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', marginBottom: 16 }}>
                        자주 묻는 질문
                    </h3>
                    {[
                        { q: '언제든 취소할 수 있나요?', a: '네, 프로필에서 언제든 구독을 취소할 수 있습니다. 취소 후에도 현재 결제 기간이 끝날 때까지 프리미엄을 이용하실 수 있어요.' },
                        { q: '결제 수단은 뭐가 있나요?', a: '국내 모든 신용/체크카드로 결제 가능합니다. (토스페이먼츠)' },
                        { q: '무료로 먼저 사용해볼 수 있나요?', a: '네! 로그인하면 하루 5회 무료로 AI 멘토와 대화할 수 있습니다.' },
                    ].map((item, i) => (
                        <details key={i} style={{
                            marginBottom: 8, background: '#fff', borderRadius: 12,
                            padding: '16px 20px', border: '1px solid #e4e4e7',
                        }}>
                            <summary style={{ fontSize: 15, fontWeight: 600, color: '#18181b', cursor: 'pointer' }}>
                                {item.q}
                            </summary>
                            <p style={{ fontSize: 14, color: '#6b7280', margin: '8px 0 0', lineHeight: 1.6 }}>
                                {item.a}
                            </p>
                        </details>
                    ))}
                </div>
            </div>
        </main>
    )
}
