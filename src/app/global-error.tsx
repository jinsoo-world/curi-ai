'use client'

import { useEffect } from 'react'

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('[Global Error]', error)
    }, [error])

    return (
        <html lang="ko">
            <body style={{
                margin: 0,
                fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
                background: '#fafafa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100dvh',
            }}>
                <div style={{
                    textAlign: 'center',
                    padding: '60px 24px',
                    maxWidth: 420,
                }}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
                    <h1 style={{
                        fontSize: 24, fontWeight: 800, color: '#18181b',
                        margin: '0 0 8px', letterSpacing: '-0.03em',
                    }}>
                        문제가 발생했어요
                    </h1>
                    <p style={{
                        fontSize: 15, color: '#6b7280', lineHeight: 1.6,
                        margin: '0 0 28px',
                    }}>
                        일시적인 오류가 발생했습니다.<br />
                        잠시 후 다시 시도해주세요.
                    </p>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                        <button
                            onClick={reset}
                            style={{
                                padding: '14px 28px', borderRadius: 12, border: 'none',
                                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                color: '#fff', fontSize: 15, fontWeight: 600,
                                cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                            }}
                        >
                            🔄 다시 시도
                        </button>
                        <button
                            onClick={() => window.location.href = '/'}
                            style={{
                                padding: '14px 28px', borderRadius: 12,
                                border: '1px solid #e5e7eb', background: '#fff',
                                color: '#374151', fontSize: 15, fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            🏠 홈으로
                        </button>
                    </div>
                    {error.digest && (
                        <p style={{ fontSize: 11, color: '#d1d5db', marginTop: 20 }}>
                            오류 코드: {error.digest}
                        </p>
                    )}
                </div>
            </body>
        </html>
    )
}
