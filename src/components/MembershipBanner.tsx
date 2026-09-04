'use client'

import { useState } from 'react'
import CreditClaimModal from '@/components/CreditClaimModal'

export function MembershipBanner() {
    const [visible, setVisible] = useState(true)
    const [showModal, setShowModal] = useState(false)

    if (!visible) return null

    return (
        <>
            <div style={{
                background: 'var(--형광)',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 60,
            }}>
                <button
                    onClick={() => setShowModal(true)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: 'none',
                        border: 'none',
                        color: 'var(--진초록)',
                        fontSize: 16,
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    <span style={{ fontSize: 18 }}>🎁</span>
                    <span>무료 체험권 받기</span>
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
                        color: 'rgba(11,74,42,0.55)',
                        fontSize: 18,
                        cursor: 'pointer',
                        padding: 4,
                        lineHeight: 1,
                    }}
                >
                    ✕
                </button>
            </div>

            {/* 정보 수취 모달 */}
            <CreditClaimModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                onComplete={() => setShowModal(false)}
            />
        </>
    )
}
