'use client'

import { useEffect } from 'react'

export default function ChatError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('[Chat Error]', error)
    }, [error])

    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: '100dvh', padding: 24,
            background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        }}>
            <div style={{
                textAlign: 'center', maxWidth: 380,
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 20, padding: '48px 32px',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(20px)',
            }}>
                <div style={{ fontSize: 56, marginBottom: 12 }}>🔌</div>
                <h2 style={{
                    fontSize: 20, fontWeight: 700, color: '#fff',
                    margin: '0 0 6px',
                }}>
                    연결이 끊어졌어요
                </h2>
                <p style={{
                    fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6,
                    margin: '0 0 24px',
                }}>
                    AI와의 연결에 문제가 생겼습니다.<br />
                    네트워크를 확인하고 다시 시도해주세요.
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
                        🔄 다시 연결
                    </button>
                    <button
                        onClick={() => window.location.href = '/mentors'}
                        style={{
                            padding: '12px 24px', borderRadius: 12,
                            border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
                            color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: 600,
                            cursor: 'pointer',
                        }}
                    >
                        ← 멘토 목록
                    </button>
                </div>
                {error.digest && (
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 16 }}>
                        오류 코드: {error.digest}
                    </p>
                )}
            </div>
        </div>
    )
}
