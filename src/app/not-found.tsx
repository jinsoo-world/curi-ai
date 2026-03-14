'use client'

import Link from 'next/link'

export default function NotFound() {
    return (
        <div style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f8f9fa',
            padding: '20px',
            textAlign: 'center',
            fontFamily: 'var(--font-noto-sans-kr), Pretendard, sans-serif',
        }}>
            <div style={{ fontSize: 80, marginBottom: 8 }}>🔍</div>
            <h1 style={{
                fontSize: 28,
                fontWeight: 800,
                color: '#18181b',
                margin: '0 0 8px',
            }}>
                페이지를 찾을 수 없어요
            </h1>
            <p style={{
                fontSize: 15,
                color: '#9ca3af',
                margin: '0 0 32px',
                lineHeight: 1.6,
            }}>
                요청하신 페이지가 존재하지 않거나 이동되었어요.<br />
                URL을 다시 확인해주세요.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
                <Link
                    href="/mentors"
                    style={{
                        padding: '12px 28px',
                        borderRadius: 12,
                        background: '#22c55e',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 15,
                        textDecoration: 'none',
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 8px rgba(34,197,94,0.3)',
                    }}
                >
                    🏠 홈으로 가기
                </Link>
                <button
                    onClick={() => window.history.back()}
                    style={{
                        padding: '12px 28px',
                        borderRadius: 12,
                        background: '#fff',
                        color: '#374151',
                        fontWeight: 600,
                        fontSize: 15,
                        border: '1px solid #e5e7eb',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                    }}
                >
                    ← 뒤로 가기
                </button>
            </div>
        </div>
    )
}
