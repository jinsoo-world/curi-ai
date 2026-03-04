'use client'

import { useState } from 'react'
import Link from 'next/link'

export function MembershipBanner() {
    const [visible, setVisible] = useState(true)

    if (!visible) return null

    return (
        <div style={{
            background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            zIndex: 60,
        }}>
            <Link
                href="/pricing"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    textDecoration: 'none',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 600,
                }}
            >
                <span style={{ fontSize: 16 }}>✨</span>
                <span>멤버십 신청하기 — 무제한 대화 & 음성 멘토링</span>
            </Link>

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
    )
}
