import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { getActiveMentors, MENTOR_IMAGES } from '@/domains/mentor'
import { MembershipBanner } from '@/components/MembershipBanner'
import type { MentorCardData } from '@/domains/mentor'
import AppSidebar from '@/components/AppSidebar'
import CreditClaimWrapper from './CreditClaimWrapper'
import { Suspense } from 'react'
import AdSlot from '@/components/AdSlot'

export const metadata: Metadata = {
    title: 'AI 발견하기',
    description: '당신에게 필요한 AI 멘토를 만나보세요. 콘텐츠 수익화, 브랜딩, 글쓰기 전문가들과 대화할 수 있습니다.',
    openGraph: {
        title: 'AI 발견하기 — 큐리 AI',
        description: '당신에게 필요한 AI 멘토를 만나보세요.',
    },
}


const fallbackMentors = [
    {
        id: 'passion-jin',
        name: '열정진',
        title: '콘텐츠 수익화 / 브랜딩 전문가',
        desc: '콘텐츠로 수익을 만들고, 퍼스널 브랜드를 구축하는 방법을 알려드립니다.',
        questions: ['콘텐츠 수익화 어디서 시작하면 좋을까요?', '퍼스널 브랜드 차별화 전략이 궁금해요'],
    },
    {
        id: 'mentor-2',
        name: '글담쌤',
        title: '글쓰기 & 콘텐츠 기획 전문가',
        desc: '매력적인 글쓰기와 콘텐츠 기획의 핵심을 짚어드립니다.',
        questions: ['블로그 글 잘 쓰는 방법이 궁금해요', '매일 글쓰기 습관 만들기'],
    },
    {
        id: 'mentor-3',
        name: 'Cathy',
        title: '실전 마케팅 & 커뮤니티 전문가',
        desc: '실전 마케팅과 커뮤니티 운영 노하우를 공유합니다.',
        questions: ['인스타그램 팔로워 늘리는 현실적인 방법', '커뮤니티 처음 만들 때 뭐부터 해야 하나요?'],
    },
]

const sampleQuestions = [
    { mentor: '열정진', question: '콘텐츠 수익화 어디서 시작하면 좋을까요?', mentorId: 'passion-jin' },
    { mentor: '글담쌤', question: '블로그 글 잘 쓰는 방법이 궁금해요', mentorId: 'mentor-2' },
    { mentor: 'Cathy', question: '인스타그램 팔로워 늘리는 현실적인 방법', mentorId: 'mentor-3' },
    { mentor: '열정진', question: '퍼스널 브랜드 차별화 전략이 궁금해요', mentorId: 'passion-jin' },
    { mentor: '글담쌤', question: '매일 글쓰기 습관 만들기', mentorId: 'mentor-2' },
]

export default async function MentorsPage() {
    const mentors = await getActiveMentors()
    const displayMentors = mentors.length > 0 ? mentors : fallbackMentors.map(m => ({
        id: m.id,
        name: m.name,
        title: m.title,
        description: m.desc,
        avatar_url: MENTOR_IMAGES[m.name] || '',
        expertise: [],
        greeting_message: '',
        sample_questions: m.questions,
    } as MentorCardData))

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

                {/* ─── Hero: Search + Category Chips ─── */}
                <section style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '48px 20px 32px',
                    textAlign: 'center',
                }}>
                    {/* Search Bar */}
                    <div style={{
                        maxWidth: 680,
                        margin: '0 auto 28px',
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                            padding: '18px 26px',
                            background: '#FFFFFF',
                            border: '1px solid var(--선)',
                            borderRadius: 999,
                            boxShadow: '0 2px 12px rgba(42, 38, 37, 0.06)',
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--먹연)" strokeWidth="2.5" strokeLinecap="round">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m21 21-4.35-4.35" />
                            </svg>
                            <input
                                type="text"
                                placeholder="무엇이 궁금하신가요?"
                                style={{
                                    flex: 1,
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: 17,
                                    color: 'var(--먹)',
                                    outline: 'none',
                                }}
                            />
                        </div>
                    </div>

                    {/* Category Chips */}
                    <div style={{
                        display: 'flex',
                        gap: 10,
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                        maxWidth: 900,
                        margin: '0 auto',
                    }}>
                        {['전체', '콘텐츠', '글쓰기', '마케팅', '브랜딩', '창업', '커리어'].map((cat, idx) => (
                            <button
                                key={cat}
                                className="delphi-category-chip"
                                data-active={idx === 0}
                                style={{
                                    padding: '11px 20px',
                                    borderRadius: 999,
                                    border: '1px solid var(--선)',
                                    background: idx === 0 ? 'var(--먹)' : '#FFFFFF',
                                    color: idx === 0 ? '#FFFFFF' : 'var(--먹연)',
                                    fontSize: 15,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 200ms',
                                }}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </section>

                {/* ─── Large Portrait Cards (Delphi style) ─── */}
                <section style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '24px 20px',
                }}>
                    <div style={{
                        display: 'flex',
                        overflowX: 'auto',
                        gap: 20,
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                        paddingBottom: 8,
                    }}>
                        {displayMentors.slice(0, 6).map((m: MentorCardData) => (
                            <Link
                                key={m.id}
                                href={`/${m.id}`}
                                className="delphi-portrait-card"
                                style={{
                                    position: 'relative',
                                    flexShrink: 0,
                                    width: 280,
                                    height: 400,
                                    borderRadius: 24,
                                    overflow: 'hidden',
                                    textDecoration: 'none',
                                    transition: 'transform 200ms',
                                }}
                            >
                                {/* Image fills entire card */}
                                {(m.avatar_url || MENTOR_IMAGES[m.name]) && (
                                    <Image
                                        src={m.avatar_url || MENTOR_IMAGES[m.name] || ''}
                                        alt={m.name}
                                        fill
                                        sizes="280px"
                                        style={{ objectFit: 'cover' }}
                                    />
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
                        ))}
                    </div>
                </section>

                {/* ─── Question List (Delphi "Ask about" style) ─── */}
                <section style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '32px 20px 56px',
                }}>
                    <h2 style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: 'var(--먹)',
                        marginBottom: 20,
                        letterSpacing: '-0.02em',
                    }}>
                        이런 질문을 해보세요
                    </h2>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                    }}>
                        {sampleQuestions.map((item, i) => (
                            <Link
                                key={i}
                                href={`/chat/${item.mentorId}`}
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
                                    {MENTOR_IMAGES[item.mentor] && (
                                        <Image
                                            src={MENTOR_IMAGES[item.mentor]}
                                            alt={item.mentor}
                                            fill
                                            sizes="48px"
                                            style={{ objectFit: 'cover' }}
                                        />
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
                                        {item.question}
                                    </div>
                                    <div style={{
                                        fontSize: 14,
                                        color: 'var(--먹연)',
                                        lineHeight: 1.3,
                                    }}>
                                        {item.mentor}
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* ─── Footer ─── */}
                <footer style={{
                    borderTop: '1px solid var(--선)',
                    background: '#FFFFFF',
                    padding: '36px 20px 80px',
                }}>
                    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                            <Image src="/logo.png" alt="큐리 AI" width={28} height={28} style={{ borderRadius: 6 }} />
                            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--먹)' }}>큐리 AI</span>
                        </div>
                        <div style={{
                            fontSize: 12, color: 'var(--먹연)', lineHeight: 1.9,
                            letterSpacing: '-0.01em',
                        }}>
                            <div>미션드리븐 (대표 : 김진수) ㅣ curious@mission-driven.kr</div>
                            <div>사업자등록번호 : 277-88-02697 ㅣ 통신판매번호 : 2023-서울마포-2003</div>
                            <div>전화번호 : 010-9716-6015</div>
                            <div>사무실 : 서울특별시 마포구 성지길 25-11 3층 비123호</div>
                        </div>
                        <div style={{
                            display: 'flex', gap: 4, marginTop: 20,
                            fontSize: 12, color: 'var(--먹연)',
                            flexWrap: 'wrap',
                        }}>
                            <Link href="/privacy" style={{ color: 'var(--먹)', textDecoration: 'none', fontWeight: 600 }}>
                                개인정보처리방침
                            </Link>
                            <span style={{ color: 'var(--선)' }}>ㅣ</span>
                            <Link href="/terms" style={{ color: 'var(--먹연)', textDecoration: 'none' }}>
                                서비스이용약관
                            </Link>
                            <span style={{ color: 'var(--선)' }}>ㅣ</span>
                            <Link href="/refund" style={{ color: 'var(--먹연)', textDecoration: 'none' }}>
                                취소·환불정책
                            </Link>
                        </div>
                        <div style={{
                            fontSize: 11, color: '#d1d5db', marginTop: 16,
                        }}>
                            Copyright © 미션드리븐 All rights reserved.
                        </div>
                    </div>
                </footer>
            </div>

            <style>{`
                /* Hide horizontal scrollbar on portrait cards */
                .delphi-portrait-card::-webkit-scrollbar {
                    display: none;
                }
                
                /* Category chip hover */
                .delphi-category-chip:hover {
                    background: var(--샌드) !important;
                    border-color: var(--먹) !important;
                    color: var(--먹) !important;
                }
                
                /* Portrait card hover */
                .delphi-portrait-card:hover {
                    transform: translateY(-4px);
                }
                
                /* Question row hover */
                .delphi-question-row:hover {
                    border-color: var(--먹);
                    box-shadow: 0 4px 16px rgba(42, 38, 37, 0.08);
                }
                
                @media (max-width: 768px) {
                    .sidebar-content {
                        margin-left: 0 !important;
                        padding-bottom: 72px;
                    }
                    
                    .delphi-portrait-card {
                        width: 240px !important;
                        height: 340px !important;
                    }
                }
            `}</style>
        </div>
    )
}
