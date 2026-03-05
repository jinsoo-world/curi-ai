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
            const { data: { user } } = await supabase.auth.getUser()
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
                ? 'linear-gradient(180deg, #f0fdf4 0%, #fff 50%)'
                : '#fafafa',
        }}>
            <div style={{
                textAlign: 'center',
                maxWidth: 400,
                background: '#fff',
                borderRadius: 24,
                padding: '48px 32px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            }}>
                {status === 'processing' && (
                    <>
                        <div style={{
                            width: 64, height: 64, margin: '0 auto 24px',
                            borderRadius: '50%', border: '4px solid #e4e4e7',
                            borderTopColor: '#22c55e',
                            animation: 'spin 1s linear infinite',
                        }} />
                        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#18181b', margin: '0 0 8px' }}>
                            결제 처리 중...
                        </h2>
                        <p style={{ fontSize: 15, color: '#6b7280', margin: 0 }}>
                            잠시만 기다려주세요
                        </p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div style={{
                            width: 72, height: 72, margin: '0 auto 24px',
                            background: '#f0fdf4', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 36,
                        }}>
                            🎉
                        </div>
                        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#18181b', margin: '0 0 8px' }}>
                            프리미엄 시작!
                        </h2>
                        <p style={{ fontSize: 15, color: '#6b7280', margin: '0 0 32px' }}>
                            {planType === 'annual' ? '연간' : '월간'} 구독이 활성화되었습니다.<br />
                            이제 하루 500회까지 멘토링을 받아보세요!
                        </p>
                        <button
                            onClick={() => router.push('/mentors')}
                            style={{
                                width: '100%', padding: '14px 24px', borderRadius: 12,
                                border: 'none', fontSize: 16, fontWeight: 700,
                                background: '#22c55e', color: '#fff', cursor: 'pointer',
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
                            background: '#fef2f2', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 36,
                        }}>
                            😥
                        </div>
                        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#18181b', margin: '0 0 8px' }}>
                            결제 실패
                        </h2>
                        <p style={{ fontSize: 15, color: '#ef4444', margin: '0 0 24px' }}>
                            {error}
                        </p>
                        <button
                            onClick={() => router.push('/pricing')}
                            style={{
                                width: '100%', padding: '14px 24px', borderRadius: 12,
                                border: '1px solid #e4e4e7', fontSize: 16, fontWeight: 600,
                                background: '#fff', color: '#18181b', cursor: 'pointer',
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
