'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('[App Error]', error)
    }, [error])

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: '60dvh', padding: 24,
        }}>
            <div style={{
                textAlign: 'center', maxWidth: 420,
                background: '#fff', borderRadius: 20,
                border: '1px solid #f0f0f0', padding: '48px 32px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
            }}>
                <div style={{ fontSize: 56, marginBottom: 12 }}>😵</div>
                <h2 style={{
                    fontSize: 22, fontWeight: 700, color: '#18181b',
                    margin: '0 0 6px',
                }}>
                    페이지를 불러올 수 없어요
                </h2>
                <p style={{
                    fontSize: 14, color: '#6b7280', lineHeight: 1.6,
                    margin: '0 0 24px',
                }}>
                    일시적인 오류가 발생했습니다.<br />
                    다시 시도하거나, 다른 페이지로 이동해주세요.
                </p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button
                        onClick={reset}
                        style={{
                            padding: '12px 24px', borderRadius: 12, border: 'none',
                            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                            color: '#fff', fontSize: 14, fontWeight: 600,
                            cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                        }}
                    >
                        🔄 다시 시도
                    </button>
                    <Link href="/mentors" style={{
                        padding: '12px 24px', borderRadius: 12,
                        border: '1px solid #e5e7eb', background: '#fff',
                        color: '#374151', fontSize: 14, fontWeight: 600,
                        textDecoration: 'none', display: 'inline-block',
                    }}>
                        🏠 홈으로
                    </Link>
                </div>
                {error.digest && (
                    <p style={{ fontSize: 11, color: '#d1d5db', marginTop: 16 }}>
                        오류 코드: {error.digest}
                    </p>
                )}
            </div>
        </div>
    )
}
