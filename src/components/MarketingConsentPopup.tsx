'use client'

import { useState, useEffect } from 'react'

interface MarketingConsentPopupProps {
    onAccept: () => void
    onDismiss: () => void
}

export default function MarketingConsentPopup({ onAccept, onDismiss }: MarketingConsentPopupProps) {
    const [isVisible, setIsVisible] = useState(false)

    useEffect(() => {
        // 슬라이드 업 애니메이션
        const timer = setTimeout(() => setIsVisible(true), 100)
        return () => clearTimeout(timer)
    }, [])

    const handleAccept = () => {
        setIsVisible(false)
        setTimeout(onAccept, 300)
    }

    const handleDismiss = () => {
        setIsVisible(false)
        setTimeout(onDismiss, 300)
    }

    return (
        <>
            {/* 백드롭 */}
            <div
                onClick={handleDismiss}
                style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.3)',
                    zIndex: 9998,
                    opacity: isVisible ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                }}
            />

            {/* 바텀시트 */}
            <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                zIndex: 9999,
                transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
                transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
            }}>
                <div style={{
                    background: '#fff',
                    borderRadius: '24px 24px 0 0',
                    padding: '32px 24px',
                    paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
                    boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
                    maxWidth: 500,
                    margin: '0 auto',
                }}>
                    {/* 핸들 */}
                    <div style={{
                        width: 40, height: 4, borderRadius: 2,
                        background: '#e5e7eb', margin: '-12px auto 20px',
                    }} />

                    {/* 이모지 아이콘 */}
                    <div style={{
                        width: 64, height: 64, borderRadius: 20,
                        background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 32, margin: '0 auto 16px',
                    }}>
                        🍀
                    </div>

                    {/* 제목 */}
                    <h3 style={{
                        fontSize: 20, fontWeight: 800, color: '#1e293b',
                        textAlign: 'center', margin: '0 0 8px',
                        letterSpacing: '-0.02em',
                    }}>
                        새 AI 소식 받고 클로버 10개 받기!
                    </h3>

                    {/* 설명 */}
                    <p style={{
                        fontSize: 14, color: '#64748b', textAlign: 'center',
                        margin: '0 0 24px', lineHeight: 1.6,
                    }}>
                        새로운 AI 멘토, 이벤트, 할인 소식을 놓치지 마세요.<br />
                        언제든 설정에서 수신 거부할 수 있어요.
                    </p>

                    {/* 혜택 태그 */}
                    <div style={{
                        display: 'flex', justifyContent: 'center', gap: 8,
                        marginBottom: 24,
                    }}>
                        {['🎁 이벤트 소식', '🤖 새 AI 알림', '💰 할인 혜택'].map((tag, i) => (
                            <span key={i} style={{
                                fontSize: 12, fontWeight: 600,
                                color: '#16a34a', background: '#f0fdf4',
                                padding: '5px 12px', borderRadius: 20,
                                border: '1px solid #dcfce7',
                            }}>
                                {tag}
                            </span>
                        ))}
                    </div>

                    {/* 버튼들 */}
                    <button
                        onClick={handleAccept}
                        style={{
                            width: '100%', padding: '16px',
                            borderRadius: 16, border: 'none',
                            fontSize: 16, fontWeight: 700, color: '#fff',
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                            cursor: 'pointer',
                            marginBottom: 10,
                        }}
                    >
                        🍀 받을래요! (+10 클로버)
                    </button>

                    <button
                        onClick={handleDismiss}
                        style={{
                            width: '100%', padding: '14px',
                            borderRadius: 16, border: 'none',
                            fontSize: 14, fontWeight: 500, color: '#94a3b8',
                            background: 'transparent',
                            cursor: 'pointer',
                        }}
                    >
                        다음에 할게요
                    </button>
                </div>
            </div>
        </>
    )
}
