'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Suspense } from 'react'

function BillingSuccessContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()
    const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
    const [error, setError] = useState('')
    const [planType, setPlanType] = useState('')
    /** 리더(크리에이터) 요금제인지 — 안내 문구와 다음 화면이 달라진다 */
    const isLeaderPlan = planType === 'pro'

    useEffect(() => {
        const processPayment = async () => {
            const authKey = searchParams.get('authKey')
            const customerKey = searchParams.get('customerKey')
            const plan = searchParams.get('planType') || 'monthly'
            setPlanType(plan)

            if (!authKey || !customerKey) {
                setStatus('error')
                setError('결제 인증 정보가 없습니다.')
                return
            }

            // 유저 확인
            // 화면을 여는 신원 확인은 getSession 으로 — getUser 는 부를 때마다 서버에 다녀온다(2026-09-16 실측 수 초)
            const { data: { session } } = await supabase.auth.getSession()
            const user = session?.user ?? null
            if (!user) {
                setStatus('error')
                setError('로그인이 필요합니다.')
                return
            }

            try {
                const res = await fetch('/api/billing/issue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        authKey,
                        customerKey,
                        planType: plan,
                        userId: user.id,
                    }),
                })

                const data = await res.json()

                if (!res.ok) {
                    throw new Error(data.error || '결제 처리에 실패했습니다.')
                }

                setStatus('success')
            } catch (err: any) {
                console.error('Payment processing error:', err)
                setStatus('error')
                setError(err.message || '결제 처리 중 오류가 발생했습니다.')
            }
        }

        processPayment()
    }, [])

    return (
        <main style={{
            minHeight: '100dvh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: status === 'success'
                ? '#fff'
                : '#fafafa',
        }}>
            <div style={{
                textAlign: 'center',
                maxWidth: 400,
                background: status === 'success' ? 'var(--color-primary-50)' : '#fff',   /* 1003 흰 바탕 + 위 카드만 연초록 */
                border: status === 'success' ? '1px solid var(--color-primary-200)' : '1px solid var(--color-neutral-200)',
                borderRadius: 16,
                padding: '48px 32px',
            }}>
                {status === 'processing' && (
                    <>
                        <div style={{
                            width: 64, height: 64, margin: '0 auto 24px',
                            borderRadius: '50%', border: '4px solid var(--color-neutral-200)',
                            borderTopColor: 'var(--color-primary-500)',
                            animation: 'spin 1s linear infinite',
                        }} />
                        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-neutral-900)', margin: '0 0 8px' }}>
                            결제 처리 중...
                        </h2>
                        <p style={{ fontSize: 15, color: 'var(--color-neutral-500)', margin: 0 }}>
                            잠시만 기다려주세요
                        </p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div style={{
                            width: 72, height: 72, margin: '0 auto 24px',
                            background: 'var(--color-primary-50)', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 36,
                        }}>
                            🎉
                        </div>
                        <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-neutral-900)', margin: '0 0 8px' }}>
                            {isLeaderPlan ? '내 AI 시작!' : '프리미엄 시작!'}
                        </h2>
                        <p style={{ fontSize: 15, color: 'var(--color-neutral-500)', margin: '0 0 32px' }}>
                            {isLeaderPlan ? (
                                <>리더 플랜이 시작됐어요.<br />
                                이제 내 AI 를 만들어 수강생에게 열어보세요!</>
                            ) : (
                                <>{planType === 'annual' ? '연간' : '월간'} 구독이 활성화되었습니다.<br />
                                이제 더 많은 멘토링을 받아보세요!</>
                            )}
                        </p>
                        <button
                            onClick={() => router.push(isLeaderPlan ? '/creator/manage' : '/mentors')}
                            style={{
                                width: '100%', padding: '14px 24px', borderRadius: 12,
                                border: 'none', fontSize: 16, fontWeight: 700,
                                background: 'var(--color-neutral-900)', color: '#fff', cursor: 'pointer',
                            }}
                        >
                            멘토 만나기 →
                        </button>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div style={{
                            width: 72, height: 72, margin: '0 auto 24px',
                            background: 'var(--color-red-50)', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 36,
                        }}>
                            😥
                        </div>
                        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-neutral-900)', margin: '0 0 8px' }}>
                            결제 실패
                        </h2>
                        <p style={{ fontSize: 15, color: 'var(--color-red-500)', margin: '0 0 24px' }}>
                            {error}
                        </p>
                        <button
                            onClick={() => router.push('/os/charge')}
                            style={{
                                width: '100%', padding: '14px 24px', borderRadius: 12,
                                border: '1px solid var(--color-neutral-200)', fontSize: 16, fontWeight: 600,
                                background: '#fff', color: 'var(--color-neutral-900)', cursor: 'pointer',
                            }}
                        >
                            다시 시도하기
                        </button>
                    </>
                )}
            </div>

            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </main>
    )
}

export default function BillingSuccessPage() {
    return (
        <Suspense fallback={
            <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p>로딩 중...</p>
            </main>
        }>
            <BillingSuccessContent />
        </Suspense>
    )
}
