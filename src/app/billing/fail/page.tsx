'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function BillingFailContent() {
    const router = useRouter()
    const searchParams = useSearchParams()

    const errorCode = searchParams.get('code') || ''
    const errorMessage = searchParams.get('message') || '결제 과정에서 오류가 발생했습니다.'

    return (
        <main style={{
            minHeight: '100dvh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'var(--color-neutral-50)',
        }}>
            <div style={{
                textAlign: 'center',
                maxWidth: 400,
                background: '#fff',
                borderRadius: 24,
                padding: '48px 32px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
            }}>
                <div style={{
                    width: 72, height: 72, margin: '0 auto 24px',
                    background: 'var(--color-red-50)', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 36,
                }}>
                    😥
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-neutral-900)', margin: '0 0 8px' }}>
                    결제를 완료하지 못했어요
                </h2>
                <p style={{ fontSize: 15, color: 'var(--color-neutral-500)', margin: '0 0 8px' }}>
                    {decodeURIComponent(errorMessage)}
                </p>
                {errorCode && (
                    <p style={{ fontSize: 13, color: 'var(--color-neutral-400)', margin: '0 0 32px' }}>
                        오류 코드: {errorCode}
                    </p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                        onClick={() => router.push('/os/charge')}
                        style={{
                            width: '100%', padding: '14px 24px', borderRadius: 12,
                            border: 'none', fontSize: 16, fontWeight: 700,
                            background: 'var(--color-neutral-900)', color: '#fff', cursor: 'pointer',
                        }}
                    >
                        다시 시도하기
                    </button>
                    <button
                        onClick={() => router.push('/mentors')}
                        style={{
                            width: '100%', padding: '14px 24px', borderRadius: 12,
                            border: '1px solid var(--color-neutral-200)', fontSize: 14, fontWeight: 500,
                            background: '#fff', color: 'var(--color-neutral-500)', cursor: 'pointer',
                        }}
                    >
                        나중에 할게요
                    </button>
                </div>
            </div>
        </main>
    )
}

export default function BillingFailPage() {
    return (
        <Suspense fallback={
            <main style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p>로딩 중...</p>
            </main>
        }>
            <BillingFailContent />
        </Suspense>
    )
}
