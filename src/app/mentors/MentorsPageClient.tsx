'use client'

import { useState, useMemo, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { MENTOR_IMAGES } from '@/domains/mentor'
import type { MentorCardData } from '@/domains/mentor'
import { MembershipBanner } from '@/components/MembershipBanner'
import AppSidebar from '@/components/AppSidebar'
import BizFooter from '@/components/BizFooter'
import CreditClaimWrapper from './CreditClaimWrapper'

// 카테고리 목록
const categories = [
    { key: 'all', label: '전체' },
    { key: 'money', label: '돈 벌기', keywords: ['수익', '돈', '블로그', '세일즈', '협상', '마케팅', '창업'] },
    { key: 'write', label: '글·책', keywords: ['책', '출판', '글', '원고', '전자책', '콘텐츠'] },
    { key: 'tool', label: 'AI·도구', keywords: ['AI', '구글', '문서', '도구', '자동화'] },
    { key: 'mind', label: '마음', keywords: ['상담', '공감', '고민', '마음', '조언'] },
]

export default function MentorsPageClient({ mentors }: { mentors: MentorCardData[] }) {
    const [searchQuery, setSearchQuery] = useState('')
    const [activeCategory, setActiveCategory] = useState('all')

    // 필터링된 멘토 목록
    const filteredMentors = useMemo(() => {
        let result = mentors

        // 카테고리 필터
        if (activeCategory !== 'all') {
            const category = categories.find(c => c.key === activeCategory)
            if (category && 'keywords' in category) {
                result = result.filter(m => {
                    const text = `${m.name} ${m.title || ''} ${m.description || ''} ${(m.expertise || []).join(' ')}`
                    return category.keywords!.some(keyword => text.includes(keyword))
                })
            }
        }

        // 검색어 필터
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim()
            result = result.filter(m => {
                const text = `${m.name} ${m.title || ''} ${m.description || ''}`.toLowerCase()
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
                <AppSidebar />
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
            {/* ─── Sidebar ─── */}
            <MembershipBanner />
            <AppSidebar />

            {/* ─── Credit Claim Modal ─── */}
            <Suspense fallback={null}>
                <CreditClaimWrapper />
            </Suspense>

            {/* ─── Main Content (Delphi Discover 스타일) ─── */}
            <div className="sidebar-content">

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

                {/* ─── Large Portrait Cards (Delphi style) ─── */}
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
                                    {avatarUrl && (
                                        <Image
                                            src={avatarUrl}
                                            alt={m.name}
                                            fill
                                            sizes="260px"
                                            style={{ objectFit: 'cover' }}
                                        />
                                    )}
                                    {!avatarUrl && (
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

                {/* ─── Question List (Delphi "Ask about" style) ─── */}
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
                            const questions = Array.isArray(m.sample_questions) ? m.sample_questions.slice(0, 1) : []
                            
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
                                        {avatarUrl && (
                                            <Image
                                                src={avatarUrl}
                                                alt={m.name}
                                                fill
                                                sizes="48px"
                                                style={{ objectFit: 'cover' }}
                                            />
                                        )}
                                        {!avatarUrl && (
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

                {/* 필터링 결과가 없을 때 */}
                {filteredMentors.length === 0 && (
                    <section style={{
                        maxWidth: 1200,
                        margin: '0 auto',
                        padding: '60px 20px',
                        textAlign: 'center',
                    }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
                        <h3 style={{ fontSize: 20, fontWeight: 700, color: 'var(--먹)', marginBottom: 8 }}>
                            검색 결과가 없어요
                        </h3>
                        <p style={{ fontSize: 16, color: 'var(--먹연)' }}>
                            다른 키워드로 검색해보세요
                        </p>
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
                /* Hide horizontal scrollbar on portrait cards */
                .delphi-portrait-card::-webkit-scrollbar {
                    display: none;
                }
                
                /* Primary CTA hover */
                :global(.discover-primary-cta:hover) {
                    background: #E8552C !important;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 16px rgba(255, 107, 53, 0.4) !important;
                }
                
                /* Category chip hover */
                :global(.delphi-category-chip:hover) {
                    background: var(--샌드) !important;
                    border-color: var(--먹) !important;
                    color: var(--먹) !important;
                }
                
                /* Portrait card hover */
                :global(.delphi-portrait-card:hover) {
                    transform: translateY(-4px);
                }
                
                /* Question row hover */
                :global(.delphi-question-row:hover) {
                    border-color: var(--먹);
                    box-shadow: 0 4px 16px rgba(42, 38, 37, 0.08);
                }
                
                @media (max-width: 768px) {
                    :global(.sidebar-content) {
                        margin-left: 0 !important;
                        padding-bottom: 72px;
                    }
                    
                    :global(.delphi-portrait-card) {
                        width: 240px !important;
                        height: 340px !important;
                    }
                }
            `}</style>
        </div>
    )
}
