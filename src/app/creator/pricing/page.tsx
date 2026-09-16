'use client'

// 리더(크리에이터) 구독 화면 — 자기 AI 를 만들어 운영하는 값을 낸다.
// 대표 확정 2026-09-14 = 「리더도 구독제로 가. 수수료는 1.5%만.」
// ⚠️ 값은 domains/subscription 한 곳에서만 가져온다. 화면에 숫자를 적어두지 않는다.
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { CREATOR_PLANS } from '@/domains/subscription'
import AppSidebar from '@/components/AppSidebar'

/** 리더 플랜 하나에 들어 있는 것 (값은 CREATOR_PLANS 에서 온다) */
const 혜택: string[] = [
    '내 AI 만들기 (개수 제한 없음)',
    '내 자료로 AI 가르치기 (강의안·FAQ·자막)',
    '수강생과 대화 무제한 · 사진 보고 답하기',
    '내 목소리로 답하기',
    '내 AI 에 값을 매겨 판매 · 대화량 보기',
]

export default function CreatorPricingPage() {
    const router = useRouter()
    const [userId, setUserId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    useEffect(() => {
        const supabase = createClient()
        supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null))
    }, [])

    const handleSubscribe = async () => {
        if (!userId) {
            router.push('/login?redirect=/creator/pricing')
            return
        }
        setLoading(true)
        setErrorMsg(null)
        try {
            const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY
            if (!clientKey) throw new Error('결제 설정이 아직 안 됐어요. 잠시 뒤 다시 시도해 주세요.')

            const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk')
            const tossPayments = await loadTossPayments(clientKey)
            const payment = tossPayments.payment({ customerKey: userId })

            await payment.requestBillingAuth({
                method: 'CARD',
                successUrl: `${window.location.origin}/billing/success?planType=pro`,
                failUrl: `${window.location.origin}/billing/fail`,
            })
        } catch (error) {
            const msg = error instanceof Error ? error.message : '결제를 시작하지 못했어요.'
            setErrorMsg(msg)
            setLoading(false)
        }
    }

    const plan = CREATOR_PLANS.pro

    return (
        <main style={{ minHeight: '100dvh', background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 40%)' }}>
            <AppSidebar />
            <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 20px 80px' }}>
                <h1 style={{ fontSize: 26, fontWeight: 800, color: '#18181b', margin: '0 0 8px', wordBreak: 'keep-all' }}>
                    내 AI 로 시작하기
                </h1>
                <p style={{ fontSize: 15, color: '#52525b', lineHeight: 1.7, margin: '0 0 28px', wordBreak: 'keep-all' }}>
                    나를 닮은 AI 를 만들어 두면, 내가 자는 동안에도 수강생 질문에 답합니다.
                </p>

                {/* 값 */}
                <div style={{
                    background: '#fff', border: '1.5px solid #bbf7d0', borderRadius: 18,
                    padding: '22px 24px', marginBottom: 18, textAlign: 'center',
                }}>
                    <div style={{ fontSize: 13, color: '#71717a', marginBottom: 6 }}>{plan.label}</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: '#18181b' }}>
                        ₩{plan.price.toLocaleString()}
                        <span style={{ fontSize: 15, fontWeight: 500, color: '#71717a' }}> / 월</span>
                    </div>
                </div>

                {/* 혜택 */}
                <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 18, padding: '20px 22px', marginBottom: 22 }}>
                    {혜택.map((f, i) => (
                        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: i === 혜택.length - 1 ? 0 : 12 }}>
                            <span style={{ color: '#22c55e', fontWeight: 700, flexShrink: 0 }}>✓</span>
                            <span style={{ fontSize: 15, color: '#3f3f46', lineHeight: 1.6, wordBreak: 'keep-all' }}>{f}</span>
                        </div>
                    ))}
                </div>

                {/* 수수료 안내 — 숨기지 않는다 */}
                <div style={{ background: '#fafafa', borderRadius: 14, padding: '14px 18px', marginBottom: 22 }}>
                    <div style={{ fontSize: 13, color: '#52525b', lineHeight: 1.7, wordBreak: 'keep-all' }}>
                        수강생이 내 AI 를 결제하면 <strong style={{ color: '#18181b' }}>결제 금액의 1.5%</strong>가
                        서비스 이용료로 나가고, 카드 수수료는 별도입니다. 나머지는 전부 내 몫입니다.
                    </div>
                </div>

                {errorMsg && (
                    <div style={{ background: '#fef2f2', color: '#dc2626', fontSize: 14, padding: '12px 16px', borderRadius: 12, marginBottom: 14 }}>
                        {errorMsg}
                    </div>
                )}

                <button
                    onClick={handleSubscribe}
                    disabled={loading}
                    style={{
                        width: '100%',
                        padding: '16px',
                        borderRadius: 16,
                        border: 'none',
                        background: loading ? '#a1a1aa' : '#22c55e',
                        color: '#fff',
                        fontSize: 16,
                        fontWeight: 700,
                        cursor: loading ? 'default' : 'pointer',
                    }}
                >
                    {loading ? '결제창을 여는 중...' : `월 ₩${plan.price.toLocaleString()} 시작하기`}
                </button>
                <p style={{ fontSize: 12, color: '#a1a1aa', textAlign: 'center', margin: '12px 0 0', lineHeight: 1.6 }}>
                    언제든 해지할 수 있어요. 해지하면 다음 달부터 결제되지 않습니다.
                </p>
            </div>
        </main>
    )
}
