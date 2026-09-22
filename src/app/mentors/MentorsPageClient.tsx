'use client'

import { useState, useMemo, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MENTOR_IMAGES } from '@/domains/mentor'
import type { MentorCardData } from '@/domains/mentor'
import { MembershipBanner } from '@/components/MembershipBanner'
import BizFooter from '@/components/BizFooter'
import CreditClaimWrapper from './CreditClaimWrapper'
import DiscoverSidebar from '@/components/DiscoverSidebar'

// 카테고리 목록 - Delphi 스타일 개선 (2026-09-22)
// CEO 요구: 실제 mentor.expertise 필드 활용, 빈 결과 피드백
const categories = [
    { key: 'all', label: '전체' },
    { key: 'money', label: '돈 벌기', keywords: ['수익', '돈', '블로그', '세일즈', '협상', '마케팅', '창업', '수익화'] },
    { key: 'write', label: '글, 책', keywords: ['책', '출판', '글', '원고', '전자책', '콘텐츠', '글쓰기'] },
    { key: 'tool', label: 'AI, 도구', keywords: ['AI', '구글', '문서', '도구', '자동화', '챗GPT'] },
    { key: 'mind', label: '마음', keywords: ['상담', '공감', '고민', '마음', '조언', '심리'] },
]

export default function MentorsPageClient({ mentors }: { mentors: MentorCardData[] }) {
    const [searchQuery, setSearchQuery] = useState('')
    const [activeCategory, setActiveCategory] = useState('all')
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    // 필터링된 멘토 목록 (expertise 필드 우선 활용)
    const filteredMentors = useMemo(() => {
        let result = mentors

        // 카테고리 필터 (expertise 배열도 함께 검색)
        if (activeCategory !== 'all') {
            const category = categories.find(c => c.key === activeCategory)
            if (category && 'keywords' in category) {
                result = result.filter(m => {
                    const expertiseText = Array.isArray(m.expertise) ? m.expertise.join(' ').toLowerCase() : ''
                    const text = `${m.name} ${m.title || ''} ${m.description || ''} ${expertiseText}`.toLowerCase()
                    return category.keywords!.some(keyword => text.toLowerCase().includes(keyword.toLowerCase()))
                })
            }
        }

        // 검색어 필터
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim()
            result = result.filter(m => {
                const expertiseText = Array.isArray(m.expertise) ? m.expertise.join(' ').toLowerCase() : ''
                const text = `${m.name} ${m.title || ''} ${m.description || ''} ${expertiseText}`.toLowerCase()
                return text.includes(query)
            })
        }

        return result
    }, [mentors, activeCategory, searchQuery])

    // 실제 DB 멘토가 없으면 빈 상태 표시
    if (mentors.length === 0) {
        return (
            <div style={{ minHeight: '100dvh', background: 'var(--종이)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
                <MembershipBanner />
                <DiscoverSidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
                <div style={{ textAlign: 'center', maxWidth: 400 }}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>🔍</div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--먹)', marginBottom: 8 }}>아직 멘토가 없어요</h2>
                    <p style={{ fontSize: 16, color: 'var(--먹연)', lineHeight: 1.6 }}>곧 멋진 멘토들을 만나실 수 있을 거예요!</p>
                </div>
            </div>
        )
    }

    return (
        <div style={{ minHeight: '100dvh', background: 'var(--종이)' }} role="document">
            {/* ─── Top Membership Banner (no AppSidebar on Discover) ─── */}
            <MembershipBanner />
            
            {/* ─── Delphi-style Left Sidebar (primary nav for Discover) ─── */}
            <DiscoverSidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />

            {/* ─── Credit Claim Modal ─── */}
            <Suspense fallback={null}>
                <CreditClaimWrapper />
            </Suspense>

            {/* ─── Main Content (Delphi Discover 스타일, left sidebar margin) ─── */}
            <div className="discover-main-content">
                {/* 모바일 햄버거 버튼 */}
                <button
                    className="discover-mobile-menu-btn"
                    onClick={() => setMobileMenuOpen(true)}
                    aria-label="메뉴 열기"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M3 12h18M3 6h18M3 18h18" />
                    </svg>
                </button>

                {/* ─── Header with CTA (Delphi style) ─── */}
                <section style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '24px 20px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    <h1 style={{
                        fontSize: 28,
                        fontWeight: 700,
                        color: 'var(--먹)',
                        margin: 0,
                    }}>
                        발견하기
                    </h1>
                    <Link
                        href="/creator/create"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '12px 24px',
                            background: '#FF6B35',
                            color: '#FFFFFF',
                            fontSize: 15,
                            fontWeight: 700,
                            borderRadius: 999,
                            textDecoration: 'none',
                            boxShadow: '0 2px 12px rgba(255, 107, 53, 0.25)',
                            transition: 'all 200ms',
                        }}
                        className="discover-primary-cta"
                    >
                        내 AI 만들기
                    </Link>
                </section>

                {/* ─── Hero: Search + Category Chips ─── */}
                <section style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '16px 20px 28px',
                    textAlign: 'center',
                }}>
                    {/* Search Bar */}
                    <div style={{
                        maxWidth: 640,
                        margin: '0 auto 20px',
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '14px 22px',
                            background: '#FFFFFF',
                            border: '1px solid var(--선)',
                            borderRadius: 999,
                            boxShadow: '0 1px 8px rgba(42, 38, 37, 0.04)',
                        }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--먹연)" strokeWidth="2.5" strokeLinecap="round">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m21 21-4.35-4.35" />
                            </svg>
                            <input
                                type="text"
                                placeholder="무엇이 궁금하신가요?"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    flex: 1,
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: 16,
                                    color: 'var(--먹)',
                                    outline: 'none',
                                }}
                            />
                        </div>
                    </div>

                    {/* Category Chips */}
                    <div style={{
                        display: 'flex',
                        gap: 8,
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                        maxWidth: 900,
                        margin: '0 auto',
                    }}>
                        {categories.map((cat) => (
                            <button
                                key={cat.key}
                                onClick={() => setActiveCategory(cat.key)}
                                className="delphi-category-chip"
                                data-active={activeCategory === cat.key}
                                style={{
                                    padding: '9px 18px',
                                    borderRadius: 999,
                                    border: '1px solid var(--선)',
                                    background: activeCategory === cat.key ? 'var(--먹)' : '#FFFFFF',
                                    color: activeCategory === cat.key ? '#FFFFFF' : 'var(--먹연)',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 200ms',
                                }}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                </section>

                {/* ─── Large Portrait Cards (Delphi style, 밀도 개선) ─── */}
                <section style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '20px 20px',
                }}>
                    <div style={{
                        display: 'flex',
                        overflowX: 'auto',
                        gap: 16,
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                        paddingBottom: 8,
                    }}>
                        {filteredMentors.slice(0, 6).map((m: MentorCardData) => {
                            const avatarUrl = m.avatar_url || MENTOR_IMAGES[m.name] || null
                            return (
                                <Link
                                    key={m.id}
                                    href={`/chat/${m.id}`}
                                    className="delphi-portrait-card"
                                    style={{
                                        position: 'relative',
                                        flexShrink: 0,
                                        width: 260,
                                        height: 380,
                                        borderRadius: 20,
                                        overflow: 'hidden',
                                        textDecoration: 'none',
                                        transition: 'transform 200ms',
                                    }}
                                >
                                    {avatarUrl ? (
                                        <Image
                                            src={avatarUrl}
                                            alt={m.name}
                                            fill
                                            sizes="260px"
                                            style={{ objectFit: 'cover' }}
                                            onError={(e) => {
                                                // 깨진 이미지 처리 - gradient fallback
                                                const target = e.target as HTMLImageElement
                                                target.style.display = 'none'
                                                const parent = target.parentElement
                                                if (parent) {
                                                    const fallback = document.createElement('div')
                                                    fallback.style.cssText = `
                                                        width: 100%;
                                                        height: 100%;
                                                        background: linear-gradient(135deg, #E8F2EC 0%, #C7E4D3 100%);
                                                        display: flex;
                                                        align-items: center;
                                                        justify-content: center;
                                                        font-size: 64px;
                                                        font-weight: 900;
                                                        color: var(--먹);
                                                    `
                                                    fallback.textContent = m.name.slice(0, 1)
                                                    parent.insertBefore(fallback, parent.firstChild)
                                                }
                                            }}
                                        />
                                    ) : (
                                        <div style={{
                                            width: '100%',
                                            height: '100%',
                                            background: 'linear-gradient(135deg, #E8F2EC 0%, #C7E4D3 100%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 64,
                                            fontWeight: 900,
                                            color: 'var(--먹)',
                                        }}>
                                            {m.name.slice(0, 1)}
                                        </div>
                                    )}
                                    {/* Gradient overlay at bottom */}
                                    <div style={{
                                        position: 'absolute',
                                        bottom: 0,
                                        left: 0,
                                        right: 0,
                                        padding: '48px 20px 20px',
                                        background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)',
                                    }}>
                                        <h3 style={{
                                            fontSize: 22,
                                            fontWeight: 700,
                                            color: '#FFFFFF',
                                            marginBottom: 4,
                                            lineHeight: 1.2,
                                        }}>
                                            {m.name}
                                        </h3>
                                        <p style={{
                                            fontSize: 14,
                                            color: 'rgba(255,255,255,0.85)',
                                            lineHeight: 1.4,
                                            margin: 0,
                                        }}>
                                            {m.title || m.description}
                                        </p>
                                    </div>
                                </Link>
                            )
                        })}
                    </div>
                </section>

                {/* ─── Question List (Delphi "Ask about" style, 빈 질문 폴백) ─── */}
                <section style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '28px 20px 48px',
                }}>
                    <h2 style={{
                        fontSize: 17,
                        fontWeight: 700,
                        color: 'var(--먹)',
                        marginBottom: 16,
                        letterSpacing: '-0.02em',
                    }}>
                        이런 질문을 해보세요
                    </h2>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                    }}>
                        {filteredMentors.map((m) => {
                            const avatarUrl = m.avatar_url || MENTOR_IMAGES[m.name] || null
                            
                            // 샘플 질문 생성 (폴백 개선 - expertise 활용)
                            let questions: string[] = []
                            if (Array.isArray(m.sample_questions) && m.sample_questions.length > 0) {
                                questions = m.sample_questions.slice(0, 1)
                            } else if (Array.isArray(m.expertise) && m.expertise.length > 0) {
                                // expertise 첫 번째 항목으로 질문 생성
                                questions = [`${m.expertise[0]}에 대해 알려주세요`]
                            } else if (m.title) {
                                questions = [`${m.title}에 대해 알려주세요`]
                            }
                            
                            if (questions.length === 0) return null

                            return questions.map((question: string, idx: number) => (
                                <Link
                                    key={`${m.id}-${idx}`}
                                    href={`/chat/${m.id}`}
                                    className="delphi-question-row"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 16,
                                        padding: '16px 20px',
                                        background: '#FFFFFF',
                                        border: '1px solid var(--선)',
                                        borderRadius: 16,
                                        textDecoration: 'none',
                                        transition: 'all 200ms',
                                    }}
                                >
                                    {/* Avatar */}
                                    <div style={{
                                        position: 'relative',
                                        flexShrink: 0,
                                        width: 48,
                                        height: 48,
                                        borderRadius: 999,
                                        overflow: 'hidden',
                                        background: 'var(--샌드)',
                                    }}>
                                        {avatarUrl ? (
                                            <Image
                                                src={avatarUrl}
                                                alt={m.name}
                                                fill
                                                sizes="48px"
                                                style={{ objectFit: 'cover' }}
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement
                                                    target.style.display = 'none'
                                                }}
                                            />
                                        ) : (
                                            <div style={{
                                                width: '100%',
                                                height: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 20,
                                                fontWeight: 700,
                                                color: 'var(--먹)',
                                            }}>
                                                {m.name.slice(0, 1)}
                                            </div>
                                        )}
                                    </div>
                                    {/* Text */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: 16,
                                            fontWeight: 600,
                                            color: 'var(--먹)',
                                            marginBottom: 2,
                                            lineHeight: 1.4,
                                        }}>
                                            {question}
                                        </div>
                                        <div style={{
                                            fontSize: 14,
                                            color: 'var(--먹연)',
                                            lineHeight: 1.3,
                                        }}>
                                            {m.name}
                                        </div>
                                    </div>
                                </Link>
                            ))
                        })}
                    </div>
                </section>

                {/* 필터링 결과가 없을 때 (카테고리 피드백 포함) */}
                {filteredMentors.length === 0 && (
                    <section style={{
                        maxWidth: 1200,
                        margin: '0 auto',
                        padding: '60px 20px',
                        textAlign: 'center',
                    }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
                        <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--먹)', marginBottom: 8 }}>
                            {activeCategory !== 'all' ? '이 카테고리에는 멘토가 없어요' : '검색 결과가 없어요'}
                        </h3>
                        <p style={{ fontSize: 16, color: 'var(--먹연)', marginBottom: 16 }}>
                            {activeCategory !== 'all' ? '전체 카테고리를 선택하거나 다른 카테고리를 둘러보세요' : '다른 키워드로 검색해보세요'}
                        </p>
                        {activeCategory !== 'all' && (
                            <button
                                onClick={() => setActiveCategory('all')}
                                style={{
                                    padding: '12px 24px',
                                    background: 'var(--먹)',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: 999,
                                    fontSize: 15,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                전체 보기
                            </button>
                        )}
                    </section>
                )}

                {/* ─── BizFooter (CEO requirement 2026-09-22) ─── */}
                <div style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '0 20px',
                }}>
                    <BizFooter maxWidth={1200} marginTop={48} />
                </div>
            </div>

            <style jsx>{`
                /* Delphi-style main content with left sidebar (no top app bar) */
                :global(.discover-main-content) {
                    margin-left: 240px;
                    min-height: 100dvh;
                    padding-top: 0;
                    background: var(--종이);
                    overflow-x: hidden;
                }

                /* Mobile menu button (no top bar, so adjust position) */
                :global(.discover-mobile-menu-btn) {
                    position: fixed;
                    top: 16px;
                    left: 16px;
                    z-index: 100;
                    display: none;
                    align-items: center;
                    justify-content: center;
                    width: 44px;
                    height: 44px;
                    background: #FFFFFF;
                    border: 1px solid var(--선);
                    border-radius: 12px;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
                    color: var(--먹);
                }

                /* Hide horizontal scrollbar on portrait cards */
                .delphi-portrait-card::-webkit-scrollbar {
                    display: none;
                }
                
                /* Primary CTA hover (ensure touch target) */
                :global(.discover-primary-cta) {
                    min-height: 44px;
                }
                
                :global(.discover-primary-cta:hover) {
                    background: #E8552C !important;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 16px rgba(255, 107, 53, 0.4) !important;
                }
                
                /* Category chip hover (ensure touch target) */
                :global(.delphi-category-chip) {
                    min-height: 44px;
                }
                
                :global(.delphi-category-chip:hover) {
                    background: var(--샌드) !important;
                    border-color: var(--먹) !important;
                    color: var(--먹) !important;
                }
                
                /* Portrait card hover */
                :global(.delphi-portrait-card) {
                    max-width: 100%;
                }
                
                :global(.delphi-portrait-card:hover) {
                    transform: translateY(-4px);
                }
                
                /* Question row hover */
                :global(.delphi-question-row:hover) {
                    border-color: var(--먹);
                    box-shadow: 0 4px 16px rgba(42, 38, 37, 0.08);
                }
                
                /* 모바일: 사이드바 없음, 햄버거 표시 */
                @media (max-width: 768px) {
                    :global(.discover-main-content) {
                        margin-left: 0 !important;
                        padding-bottom: 72px;
                        overflow-x: hidden;
                    }

                    :global(.discover-mobile-menu-btn) {
                        display: flex;
                    }
                    
                    :global(.delphi-portrait-card) {
                        width: 220px !important;
                        height: 320px !important;
                    }

                    /* 모바일 카테고리 칩 밀도 */
                    :global(.delphi-category-chip) {
                        padding: 8px 14px !important;
                        font-size: 13px !important;
                    }

                    /* 모바일 질문 행 밀도 */
                    :global(.delphi-question-row) {
                        padding: 12px 16px !important;
                        gap: 12px !important;
                    }
                }
            `}</style>
        </div>
    )
}
