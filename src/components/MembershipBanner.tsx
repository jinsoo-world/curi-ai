'use client'

import { useState } from 'react'
import CreditClaimModal from '@/components/CreditClaimModal'

export function MembershipBanner() {
    const [visible, setVisible] = useState(true)
    const [showCreditModal, setShowCreditModal] = useState(false)

    if (!visible) return null

    return (
        <>
            <div style={{
                background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 60,
            }}>
                <button
                    onClick={() => setShowCreditModal(true)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: 'none',
                        border: 'none',
                        color: '#fff',
                        fontSize: 16,
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    <span style={{ fontSize: 18 }}>💸</span>
                    <span>1만원 크레딧 받기</span>
                </button>

                {/* 닫기 버튼 */}
                <button
                    onClick={(e) => {
                        e.preventDefault()
                        setVisible(false)
                    }}
                    aria-label="배너 닫기"
                    style={{
                        position: 'absolute',
                        right: 16,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'rgba(255,255,255,0.7)',
                        fontSize: 18,
                        cursor: 'pointer',
                        padding: 4,
                        lineHeight: 1,
                    }}
                >
                    ✕
                </button>
            </div>

            {/* 크레딧 받기 모달 */}
            <CreditClaimModal
                isOpen={showCreditModal}
                onClose={() => setShowCreditModal(false)}
                onComplete={() => setShowCreditModal(false)}
            />
        </>
    )
}
