'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

export default function WelcomeModal() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const [show, setShow] = useState(false)

    useEffect(() => {
        if (searchParams.get('welcome') === 'true') {
            setShow(true)
        }
    }, [searchParams])

    const handleClose = () => {
        setShow(false)
        // URL에서 ?welcome=true 제거
        const url = new URL(window.location.href)
        url.searchParams.delete('welcome')
        router.replace(url.pathname, { scroll: false })
    }

    if (!show) return null

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={handleClose}
                style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 100,
                    animation: 'fadeIn 300ms ease',
                }}
            />

            {/* Modal */}
            <div style={{
                position: 'fixed',
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 380, maxWidth: '90vw',
                background: '#fff',
                borderRadius: 24,
                padding: '40px 32px 32px',
                textAlign: 'center',
                zIndex: 101,
                boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
                animation: 'scaleIn 300ms ease',
            }}>
                {/* Icon bg */}
                <div style={{
                    width: 72, height: 72,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 20px',
                }}>
                    <span style={{ fontSize: 36 }}>✅</span>
                </div>

                <h2 style={{
                    fontSize: 22, fontWeight: 800, color: '#18181b',
                    margin: '0 0 24px',
                }}>
                    🎉 무료 체험이 시작되었습니다!
                </h2>

                {/* Duration highlight */}
                <div style={{
                    fontSize: 56, fontWeight: 900,
                    background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    lineHeight: 1.1,
                }}>
                    7<span style={{ fontSize: 28 }}>일</span>
                </div>

                <p style={{
                    fontSize: 16, color: '#6b7280',
                    margin: '12px 0 28px', lineHeight: 1.5,
                }}>
                    모든 AI 기능을 무료로 사용할 수 있어요
                </p>

                {/* CTA button */}
                <button
                    onClick={handleClose}
                    style={{
                        width: '100%',
                        padding: '16px 24px',
                        borderRadius: 14,
                        border: 'none',
                        fontSize: 17, fontWeight: 700,
                        color: '#fff',
                        background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(34,197,94,0.35)',
                        transition: 'transform 150ms ease, box-shadow 150ms ease',
                    }}
                >
                    시작하기
                </button>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
                    to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                }
            `}</style>
        </>
    )
}
