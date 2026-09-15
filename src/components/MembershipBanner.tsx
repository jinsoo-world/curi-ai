'use client'

/**
 * 위 띠 — 대표 확정 2026-09-15 「클로버 최대 70퍼센트 할인 중」
 *
 * 전에는 「무료 체험권 받기」였다. 7일 무료 체험은 사진에 아무 혜택이 없어 걷어냈다.
 * 지금 파는 것은 클로버 충전 하나뿐이고 1회성 결제다(구독이 아니다).
 * 그래서 띠도 바로 살 수 있는 것을 가리킨다.
 */
import { useState } from 'react'
import Link from 'next/link'
import CloverIcon from '@/components/ui/CloverIcon'
import { CLOVER_PACKS, discountPercent } from '@/domains/credit/packs'

export function MembershipBanner() {
    const [visible, setVisible] = useState(true)
    const 최대할인 = Math.max(...CLOVER_PACKS.map(discountPercent))

    if (!visible) return null

    return (
        <>
            <div style={{
                background: '#EAF7EF',
                borderBottom: '1px solid var(--선)',
                padding: '9px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                zIndex: 60,
            }}>
                <Link
                    href="/charge"
                    style={{
                        textDecoration: 'none',
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
                    <CloverIcon size={18} />
                    <span>클로버 최대 {최대할인}퍼센트 할인 중</span>
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

        </>
    )
}
