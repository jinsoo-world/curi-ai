'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppSidebar from '@/components/AppSidebar'
import { createClient } from '@/lib/supabase/client'

interface StoreItem {
    id: string
    name: string
    brand: string
    category: string
    originalPrice: number
    discountPercent: number
    cloverPrice: number
    emoji: string
}

const CATEGORIES = ['전체', '편의점', '커피/음료', '아이스크림']

const STORE_ITEMS: StoreItem[] = [
    // 편의점
    { id: '1', name: 'CU 모바일상품권 1천원', brand: 'CU', category: '편의점', originalPrice: 1000, discountPercent: 10, cloverPrice: 900, emoji: '🏬' },
    { id: '2', name: 'GS25 모바일상품권 1천원', brand: 'GS25', category: '편의점', originalPrice: 1000, discountPercent: 10, cloverPrice: 900, emoji: '🏪' },
    // 커피/음료
    { id: '3', name: '스타벅스 아메리카노 Tall', brand: '스타벅스', category: '커피/음료', originalPrice: 4500, discountPercent: 10, cloverPrice: 4050, emoji: '☕' },
    // 아이스크림
    { id: '4', name: '베스킨라빈스 싱글킹', brand: '배스킨라빈스', category: '아이스크림', originalPrice: 3800, discountPercent: 10, cloverPrice: 3420, emoji: '🍦' },
]

export default function CloverStorePage() {
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [clovers, setClovers] = useState(0)
    const [coupons, setCoupons] = useState(0)
    const [selectedCategory, setSelectedCategory] = useState('전체')
    const [showInfoModal, setShowInfoModal] = useState(false)
    const [showPurchaseModal, setShowPurchaseModal] = useState<StoreItem | null>(null)

    useEffect(() => {
        const supabase = createClient()
        const fetchData = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            setUser(user)
            if (user) {
                const { data: profile } = await supabase
                    .from('users')
                    .select('clovers')
                    .eq('id', user.id)
                    .single()
                setClovers(profile?.clovers || 0)
            }
            setLoading(false)
        }
        fetchData()
    }, [])

    const filteredItems = selectedCategory === '전체'
        ? STORE_ITEMS
        : STORE_ITEMS.filter(item => item.category === selectedCategory)

    return (
        <>
            <AppSidebar />
            <main style={{
                marginLeft: 240,
                minHeight: '100dvh',
                background: '#fafafa',
                padding: '32px 24px 80px',
            }}>
                <style>{`
                    @media (max-width: 768px) {
                        main { margin-left: 0 !important; padding-top: 64px !important; }
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>

                <div style={{ maxWidth: 800, margin: '0 auto' }}>
                    {/* 헤더 */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        marginBottom: 4, animation: 'fadeIn 0.3s ease',
                    }}>
                        <h1 style={{
                            fontSize: 24, fontWeight: 800, color: '#18181b',
                            letterSpacing: '-0.03em', margin: 0,
                        }}>
                            🍀 클로버 스토어
                        </h1>
                        <button
                            onClick={() => setShowInfoModal(true)}
                            style={{
                                width: 22, height: 22, borderRadius: '50%',
                                border: '1.5px solid #d1d5db', background: '#fff',
                                fontSize: 12, color: '#9ca3af', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            ?
                        </button>
                    </div>
                    <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4, marginBottom: 20, animation: 'fadeIn 0.3s ease' }}>
                        미션으로 모은 클로버를 다양한 혜택과 교환하세요!
                    </p>

                    {/* 클로버 잔고 + 쿠폰함 */}
                    <div style={{
                        display: 'flex', gap: 12, marginBottom: 24,
                        animation: 'fadeIn 0.4s ease',
                    }}>
                        <div style={{
                            flex: 1,
                            background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)',
                            border: '1.5px solid #bbf7d0',
                            borderRadius: 14,
                            padding: '16px 20px',
                        }}>
                            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>보유 클로버</div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#15803d' }}>
                                🍀 {user ? clovers.toLocaleString() : '—'}
                            </div>
                        </div>
                        <div style={{
                            flex: 1,
                            background: '#fff',
                            border: '1px solid #f0f0f0',
                            borderRadius: 14,
                            padding: '16px 20px',
                        }}>
                            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>내 쿠폰함</div>
                            <div style={{ fontSize: 24, fontWeight: 800, color: '#374151' }}>
                                🎟️ {user ? coupons : '—'}
                            </div>
                        </div>
                    </div>

                    {/* 비로그인 */}
                    {!loading && !user && (
                        <div style={{
                            textAlign: 'center', padding: '48px 20px',
                            background: '#fff', borderRadius: 20,
                            border: '1px solid #f0f0f0',
                            animation: 'fadeIn 0.4s ease',
                            marginBottom: 24,
                        }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>🔐</div>
                            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', marginBottom: 6 }}>
                                로그인이 필요합니다
                            </h2>
                            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, marginBottom: 20 }}>
                                클로버 스토어를 이용하려면 로그인해주세요!
                            </p>
                            <Link href="/login" style={{
                                display: 'inline-block', padding: '12px 28px', borderRadius: 12,
                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 15,
                                boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                            }}>
                                🚀 로그인하기
                            </Link>
                        </div>
                    )}

                    {/* 카테고리 탭 */}
                    <div style={{
                        display: 'flex', gap: 8, marginBottom: 20,
                        overflowX: 'auto', paddingBottom: 4,
                        animation: 'fadeIn 0.4s ease',
                    }}>
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setSelectedCategory(cat)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: 20,
                                    border: selectedCategory === cat ? '1.5px solid #22c55e' : '1px solid #e5e7eb',
                                    background: selectedCategory === cat ? '#f0fdf4' : '#fff',
                                    color: selectedCategory === cat ? '#15803d' : '#6b7280',
                                    fontSize: 13,
                                    fontWeight: selectedCategory === cat ? 600 : 500,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 150ms',
                                }}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    {/* 정렬 */}
                    <div style={{
                        display: 'flex', justifyContent: 'flex-end',
                        marginBottom: 12, animation: 'fadeIn 0.4s ease',
                    }}>
                        <span style={{ fontSize: 13, color: '#9ca3af' }}>
                            낮은 가격순
                        </span>
                    </div>

                    {/* 상품 그리드 */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: 14,
                        animation: 'fadeIn 0.5s ease',
                    }}>
                        {filteredItems.map((item, idx) => (
                            <div
                                key={item.id}
                                onClick={() => user && setShowPurchaseModal(item)}
                                style={{
                                    background: '#fff',
                                    borderRadius: 14,
                                    border: '1px solid #f0f0f0',
                                    overflow: 'hidden',
                                    cursor: user ? 'pointer' : 'default',
                                    transition: 'transform 150ms, box-shadow 150ms',
                                    animation: `fadeIn ${0.3 + idx * 0.05}s ease`,
                                }}
                                onMouseEnter={(e) => {
                                    if (user) {
                                        e.currentTarget.style.transform = 'translateY(-2px)'
                                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.08)'
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)'
                                    e.currentTarget.style.boxShadow = 'none'
                                }}
                            >
                                {/* 이미지 영역 */}
                                <div style={{
                                    height: 140,
                                    background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 56,
                                    position: 'relative',
                                }}>
                                    {item.emoji}
                                    {/* 할인 배지 */}
                                    <div style={{
                                        position: 'absolute', top: 8, left: 8,
                                        background: '#ef4444', color: '#fff',
                                        padding: '2px 8px', borderRadius: 6,
                                        fontSize: 11, fontWeight: 700,
                                    }}>
                                        {item.discountPercent}%
                                    </div>
                                </div>

                                {/* 상품 정보 */}
                                <div style={{ padding: '12px 14px 16px' }}>
                                    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 2 }}>
                                        {item.brand}
                                    </div>
                                    <div style={{
                                        fontSize: 14, fontWeight: 600, color: '#18181b',
                                        marginBottom: 8, lineHeight: 1.4,
                                        display: '-webkit-box',
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: 'vertical',
                                        overflow: 'hidden',
                                    }}>
                                        {item.name}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{
                                            fontSize: 13, color: '#ef4444', fontWeight: 700,
                                        }}>
                                            {item.discountPercent}%
                                        </span>
                                        <span style={{
                                            fontSize: 12, color: '#9ca3af',
                                            textDecoration: 'line-through',
                                        }}>
                                            {item.originalPrice.toLocaleString()}
                                        </span>
                                    </div>
                                    <div style={{
                                        fontSize: 16, fontWeight: 800, color: '#15803d',
                                        marginTop: 2,
                                    }}>
                                        🍀 {item.cloverPrice.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 안내 문구 */}
                    <div style={{
                        marginTop: 32, textAlign: 'center',
                        padding: '20px',
                        animation: 'fadeIn 0.6s ease',
                    }}>
                        <div style={{
                            padding: '14px 20px',
                            background: '#fef3c7',
                            borderRadius: 12,
                            fontSize: 14,
                            color: '#92400e',
                            border: '1px solid #fde68a',
                            display: 'inline-block',
                        }}>
                            🚧 클로버 스토어는 현재 준비 중입니다. 곧 실제 교환 기능이 오픈됩니다!
                        </div>
                    </div>
                </div>
            </main>

            {/* 클로버란? 모달 */}
            {showInfoModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(4px)',
                    padding: 24,
                }}>
                    <div style={{
                        background: '#fff', borderRadius: 20,
                        padding: '32px 28px', maxWidth: 380, width: '100%',
                        textAlign: 'center', position: 'relative',
                        animation: 'fadeIn 0.3s ease',
                    }}>
                        <button
                            onClick={() => setShowInfoModal(false)}
                            style={{
                                position: 'absolute', top: 14, right: 14,
                                width: 32, height: 32, borderRadius: '50%',
                                background: 'rgba(0,0,0,0.06)', border: 'none',
                                fontSize: 16, color: '#6b7280', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            ✕
                        </button>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>🍀</div>
                        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#18181b', marginBottom: 8 }}>
                            클로버란 무엇일까요?
                        </h3>
                        <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.7 }}>
                            클로버는 큐리 AI에서 받을 수 있는 새로운 보상이에요.<br />
                            미션을 완료하고 클로버를 모아보세요.<br />
                            클로버는 스토어에서 모바일 상품권 등<br />
                            다양한 혜택으로 교환할 수 있어요!
                        </p>
                        <button
                            onClick={() => setShowInfoModal(false)}
                            style={{
                                marginTop: 20, width: '100%',
                                padding: '14px', borderRadius: 12,
                                border: '1px solid #e5e7eb', background: '#fff',
                                fontSize: 15, fontWeight: 600, color: '#374151',
                                cursor: 'pointer',
                            }}
                        >
                            확인
                        </button>
                    </div>
                </div>
            )}

            {/* 구매 확인 모달 */}
            {showPurchaseModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(4px)',
                    padding: 24,
                }}>
                    <div style={{
                        background: '#fff', borderRadius: 20,
                        padding: '32px 28px', maxWidth: 380, width: '100%',
                        textAlign: 'center', position: 'relative',
                        animation: 'fadeIn 0.3s ease',
                    }}>
                        <button
                            onClick={() => setShowPurchaseModal(null)}
                            style={{
                                position: 'absolute', top: 14, right: 14,
                                width: 32, height: 32, borderRadius: '50%',
                                background: 'rgba(0,0,0,0.06)', border: 'none',
                                fontSize: 16, color: '#6b7280', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            ✕
                        </button>
                        <div style={{ fontSize: 56, marginBottom: 12 }}>{showPurchaseModal.emoji}</div>
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#18181b', marginBottom: 4 }}>
                            {showPurchaseModal.name}
                        </h3>
                        <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>
                            {showPurchaseModal.brand}
                        </div>

                        <div style={{
                            background: '#f4f4f5', borderRadius: 12,
                            padding: '14px 16px', marginBottom: 16,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontSize: 14, color: '#6b7280' }}>정가</span>
                                <span style={{ fontSize: 14, color: '#9ca3af', textDecoration: 'line-through' }}>
                                    ₩{showPurchaseModal.originalPrice.toLocaleString()}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 14, color: '#6b7280' }}>교환 가격</span>
                                <span style={{ fontSize: 18, fontWeight: 800, color: '#15803d' }}>
                                    🍀 {showPurchaseModal.cloverPrice.toLocaleString()}
                                </span>
                            </div>
                        </div>

                        <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            padding: '10px 16px',
                            background: clovers >= showPurchaseModal.cloverPrice ? '#f0fdf4' : '#fef2f2',
                            borderRadius: 10,
                            marginBottom: 20,
                            border: clovers >= showPurchaseModal.cloverPrice ? '1px solid #bbf7d0' : '1px solid #fecaca',
                        }}>
                            <span style={{ fontSize: 13, color: '#6b7280' }}>내 클로버</span>
                            <span style={{
                                fontSize: 14, fontWeight: 700,
                                color: clovers >= showPurchaseModal.cloverPrice ? '#15803d' : '#dc2626',
                            }}>
                                🍀 {clovers.toLocaleString()}
                            </span>
                        </div>

                        {clovers >= showPurchaseModal.cloverPrice ? (
                            <button
                                onClick={() => {
                                    alert('🚧 클로버 스토어는 아직 준비 중입니다!\n곧 실제 교환 기능이 오픈되니 기대해주세요!')
                                    setShowPurchaseModal(null)
                                }}
                                style={{
                                    width: '100%', padding: '14px', borderRadius: 12,
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    color: '#fff', fontSize: 16, fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                                }}
                            >
                                교환하기
                            </button>
                        ) : (
                            <div>
                                <button
                                    disabled
                                    style={{
                                        width: '100%', padding: '14px', borderRadius: 12,
                                        border: 'none', background: '#e5e7eb',
                                        color: '#9ca3af', fontSize: 16, fontWeight: 700,
                                        cursor: 'not-allowed',
                                    }}
                                >
                                    클로버가 부족합니다
                                </button>
                                <Link href="/missions" style={{
                                    display: 'block', marginTop: 10,
                                    fontSize: 13, color: '#22c55e', textDecoration: 'none',
                                    fontWeight: 600,
                                }}>
                                    🍀 미션에서 클로버 모으기 →
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
