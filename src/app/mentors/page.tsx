import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { getActiveMentors, MENTOR_IMAGES } from '@/domains/mentor'
import { MembershipBanner } from '@/components/MembershipBanner'
import type { MentorCardData } from '@/domains/mentor'
import NotificationBanner from './NotificationBanner'
import WelcomeGift from '@/components/WelcomeGift'
import MentorBoard from '@/components/ui/MentorBoard'
import AppSidebar from '@/components/AppSidebar'
import CreditClaimWrapper from './CreditClaimWrapper'
import { Suspense } from 'react'
import AdSlot from '@/components/AdSlot'
import ClaimPhoto from '@/components/studio/ClaimPhoto'
import FirstGuide from '@/components/studio/FirstGuide'

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
        desc: '콘텐츠로 수익을 만들고, 퍼스널 브랜드를 구축하는 방법을 알려드립니다. 큐리어스 대표이자 콘텐츠 크리에이터로서의 실전 경험을 나눕니다.',
        questions: ['콘텐츠 수익화 어디서 시작하면 좋을까요?', '퍼스널 브랜드 차별화 전략이 궁금해요'],
    },
    {
        id: 'mentor-2',
        name: '글담쌤',
        title: '글쓰기 & 콘텐츠 기획 전문가',
        desc: '매력적인 글쓰기와 콘텐츠 기획의 핵심을 짚어드립니다. 큐리어스에서 글쓰기 클래스를 운영하고 있습니다.',
        questions: ['블로그 글 잘 쓰는 방법이 궁금해요', '매일 글쓰기 습관 만들기'],
    },
    {
        id: 'mentor-3',
        name: 'Cathy',
        title: '실전 마케팅 & 커뮤니티 전문가',
        desc: '실전 마케팅과 커뮤니티 운영 노하우를 공유합니다. 큐리어스에서 마케팅 클래스를 담당하고 있습니다.',
        questions: ['인스타그램 팔로워 늘리는 현실적인 방법', '커뮤니티 처음 만들 때 뭐부터 해야 하나요?'],
    },
]

export default async function MentorsPage() {
    const mentors = await getActiveMentors()

    return (
        <div style={{ minHeight: '100dvh', background: 'var(--종이)' }} role="document">

            {/* ─── Sidebar ─── */}
            <MembershipBanner />
            <AppSidebar />
            <FirstGuide />
            <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 18px" }}><ClaimPhoto /></div>

            {/* ─── Credit Claim Modal ─── */}
            <Suspense fallback={null}>
                <CreditClaimWrapper />
            </Suspense>

            {/* ─── Main Content (Delphi 스타일 발견 화면) ─── */}
            <div className="sidebar-content">

                {/* ─── 환영 선물 + 알림 ─── */}
                <WelcomeGift />
                <NotificationBanner />

                {/* ─── Delphi 스타일 히어로 섹션 ─── */}
                <section style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '64px 20px 48px',
                    textAlign: 'center',
                    position: 'relative',
                }}>
                    {/* 큰 히어로 텍스트 (Delphi "What's on your mind?" 스타일) */}
                    <h1 style={{
                        fontSize: 'clamp(36px, 8vw, 56px)',
                        fontWeight: 800,
                        color: 'var(--먹)',
                        marginBottom: 32,
                        lineHeight: 1.2,
                        letterSpacing: '-0.03em',
                    }}>
                        마음에 있는 것을<br />물어보세요
                    </h1>

                    {/* 검색 바 */}
                    <div style={{
                        maxWidth: 640,
                        margin: '0 auto 24px',
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '16px 24px',
                            background: 'var(--카드)',
                            border: '1px solid var(--선)',
                            borderRadius: 999,
                            boxShadow: 'var(--그림자)',
                        }}>
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--먹연)" strokeWidth="2" strokeLinecap="round">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m21 21-4.35-4.35" />
                            </svg>
                            <input
                                type="text"
                                placeholder="콘텐츠 수익화가 궁금해요"
                                style={{
                                    flex: 1,
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: 17,
                                    color: 'var(--먹)',
                                    outline: 'none',
                                }}
                            />
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--먹연)" strokeWidth="2" strokeLinecap="round">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                <line x1="12" y1="19" x2="12" y2="23" />
                                <line x1="8" y1="23" x2="16" y2="23" />
                            </svg>
                        </div>
                    </div>

                    {/* 카테고리 칩 (가운데 정렬) */}
                    <div style={{
                        display: 'flex',
                        gap: 10,
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                        maxWidth: 800,
                        margin: '0 auto',
                    }}>
                        {['콘텐츠 & 수익화', '글쓰기', '마케팅', '브랜딩', '창업', '커리어'].map(cat => (
                            <button
                                key={cat}
                                style={{
                                    padding: '10px 18px',
                                    borderRadius: 999,
                                    border: '1px solid var(--선)',
                                    background: 'var(--카드)',
                                    color: 'var(--먹연)',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 200ms',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = 'var(--샌드)'
                                    e.currentTarget.style.borderColor = 'var(--먹연)'
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = 'var(--카드)'
                                    e.currentTarget.style.borderColor = 'var(--선)'
                                }}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </section>

                {/* ─── 실제 고민들 (Delphi "Real situations" 스타일) ─── */}
                <section style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '0 20px 56px',
                }}>
                    <h2 style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: 'var(--먹)',
                        marginBottom: 20,
                    }}>
                        이런 고민이 있으신가요?
                    </h2>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                        gap: 16,
                    }}>
                        {[
                            { q: '콘텐츠로 수익을 만들고 싶은데 어디서 시작해야 할지 모르겠어요', cat: '콘텐츠', count: 8 },
                            { q: '블로그 글은 쓰는데 사람들이 안 봐요. 뭐가 문제일까요?', cat: '글쓰기', count: 12 },
                            { q: '퍼스널 브랜드를 만들고 싶은데 어떻게 차별화해야 하나요?', cat: '브랜딩', count: 6 },
                        ].map((item, i) => (
                            <Link
                                key={i}
                                href={`/mentors?q=${encodeURIComponent(item.q)}`}
                                style={{
                                    display: 'block',
                                    padding: 20,
                                    background: 'var(--카드)',
                                    border: '1px solid var(--선)',
                                    borderRadius: 'var(--둥근)',
                                    textDecoration: 'none',
                                    transition: 'all 200ms',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-2px)'
                                    e.currentTarget.style.boxShadow = 'var(--그림자-대)'
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'none'
                                    e.currentTarget.style.boxShadow = 'none'
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: 12,
                                    marginBottom: 12,
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--먹연)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                    </svg>
                                    <p style={{
                                        fontSize: 16,
                                        color: 'var(--먹)',
                                        lineHeight: 1.5,
                                        margin: 0,
                                    }}>
                                        {item.q}
                                    </p>
                                </div>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 12,
                                    marginTop: 16,
                                }}>
                                    <span style={{
                                        fontSize: 13,
                                        fontWeight: 600,
                                        color: 'var(--먹연)',
                                        padding: '4px 12px',
                                        background: 'var(--샌드)',
                                        borderRadius: 999,
                                    }}>
                                        {item.cat}
                                    </span>
                                    <span style={{
                                        fontSize: 13,
                                        color: 'var(--먹연)',
                                    }}>
                                        {item.count}명이 물었어요
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>

                {/* ─── 알아두면 좋은 AI (Delphi "Worth knowing" 스타일) ─── */}
                {mentors.length > 0 && (
                    <section style={{
                        maxWidth: 1200,
                        margin: '0 auto',
                        padding: '0 20px 56px',
                    }}>
                        <h2 style={{
                            fontSize: 20,
                            fontWeight: 700,
                            color: 'var(--먹)',
                            marginBottom: 20,
                        }}>
                            알아두면 좋은 AI 멘토
                        </h2>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                            gap: 20,
                        }}>
                            {mentors.slice(0, 4).map((m: MentorCardData) => (
                                <Link
                                    key={m.id}
                                    href={`/${m.id}`}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        background: 'var(--카드)',
                                        borderRadius: 'var(--둥근)',
                                        overflow: 'hidden',
                                        textDecoration: 'none',
                                        border: '1px solid var(--선)',
                                        transition: 'all 200ms',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-4px)'
                                        e.currentTarget.style.boxShadow = 'var(--그림자-대)'
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'none'
                                        e.currentTarget.style.boxShadow = 'none'
                                    }}
                                >
                                    <div style={{
                                        position: 'relative',
                                        aspectRatio: '3/4',
                                        background: 'var(--샌드)',
                                    }}>
                                        {(m.avatar_url || MENTOR_IMAGES[m.name]) && (
                                            <Image
                                                src={m.avatar_url || MENTOR_IMAGES[m.name] || ''}
                                                alt={m.name}
                                                fill
                                                sizes="(max-width: 768px) 50vw, 33vw"
                                                style={{ objectFit: 'cover' }}
                                            />
                                        )}
                                    </div>
                                    <div style={{ padding: 18 }}>
                                        <h3 style={{
                                            fontSize: 18,
                                            fontWeight: 700,
                                            color: 'var(--먹)',
                                            marginBottom: 6,
                                        }}>
                                            {m.name}
                                        </h3>
                                        <p style={{
                                            fontSize: 14,
                                            color: 'var(--먹연)',
                                            lineHeight: 1.5,
                                            marginBottom: 12,
                                        }}>
                                            {m.title || m.description}
                                        </p>
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            padding: '6px 12px',
                                            background: 'var(--샌드)',
                                            borderRadius: 999,
                                            fontSize: 13,
                                            fontWeight: 600,
                                            color: 'var(--먹)',
                                        }}>
                                            물어보기
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </section>
                )}

                {/* ─── 모든 AI 멘토 그리드 ─── */}
                <MentorBoard
                    mentors={(mentors.length > 0
                        ? mentors.map((m: MentorCardData) => ({
                            id: m.id,
                            name: m.name,
                            title: m.title || m.description || '',
                            image: m.avatar_url || MENTOR_IMAGES[m.name] || null,
                            expertise: m.expertise || [],
                        }))
                        : fallbackMentors.map((m) => ({
                            id: m.id,
                            name: m.name,
                            title: m.title || m.desc || '',
                            image: MENTOR_IMAGES[m.name] || '/mentors/passion-jin.png',
                            expertise: [],
                        }))
                    )}
                />

                {/* ─── 광고 + Footer ─── */}
                <AdSlot />
                <footer className="mentors-footer" style={{
                    borderTop: '1px solid var(--선)',
                    background: 'var(--카드)',
                    padding: '36px 20px 60px',
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
                @media (max-width: 768px) {
                    .sidebar-content {
                        margin-left: 0 !important;
                        padding-bottom: 72px;
                    }
                }
            `}</style>
        </div>
    )
}
