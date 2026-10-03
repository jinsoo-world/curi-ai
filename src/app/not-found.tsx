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
            background: 'var(--color-neutral-50)',
            padding: '20px',
            textAlign: 'center',
            fontFamily: 'Pretendard, -apple-system, sans-serif',
        }}>
            
            <h1 style={{
                fontSize: 28,
                fontWeight: 800,
                color: 'var(--color-neutral-900)',
                margin: '0 0 8px',
            }}>
                페이지를 찾을 수 없어요
            </h1>
            <p style={{
                fontSize: 15,
                color: 'var(--color-neutral-400)',
                margin: '0 0 32px',
                lineHeight: 1.6,
            }}>
                요청하신 페이지가 존재하지 않거나 이동되었어요.<br />
                URL을 다시 확인해주세요.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
                <Link
                    href="/"
                    style={{
                        padding: '12px 28px',
                        borderRadius: 12,
                        background: 'var(--color-neutral-900)',
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
                        color: 'var(--color-neutral-700)',
                        fontWeight: 600,
                        fontSize: 15,
                        border: '1px solid var(--color-neutral-200)',
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
