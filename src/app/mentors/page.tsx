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

                {/* ─── Delphi 스타일 발견 헤더 ─── */}
                <section style={{
                    maxWidth: 1200,
                    margin: '0 auto',
                    padding: '48px 20px 32px',
                }}>
                    {/* 검색 바 */}
                    <div style={{
                        maxWidth: 600,
                        margin: '0 auto 32px',
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '14px 20px',
                            background: 'var(--카드)',
                            border: '1px solid var(--선)',
                            borderRadius: 999,
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--먹연)" strokeWidth="2">
                                <circle cx="11" cy="11" r="7" />
                                <path d="m21 21-4.35-4.35" />
                            </svg>
                            <input
                                type="text"
                                placeholder="어떤 AI 멘토를 찾으시나요?"
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

                    {/* 카테고리 칩 */}
                    <div style={{
                        display: 'flex',
                        gap: 12,
                        overflowX: 'auto',
                        paddingBottom: 12,
                        scrollbarWidth: 'none',
                    }}>
                        {['전체', '콘텐츠', '글쓰기', '마케팅', '브랜딩', '창업'].map(cat => (
                            <button
                                key={cat}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: 999,
                                    border: cat === '전체' ? 'none' : '1px solid var(--선)',
                                    background: cat === '전체' ? 'var(--단추)' : 'var(--카드)',
                                    color: cat === '전체' ? '#fff' : 'var(--먹연)',
                                    fontSize: 15,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </section>

                {/* ─── 추천 AI (Featured) ─── */}
                {mentors.length > 0 && (
                    <section style={{
                        maxWidth: 1200,
                        margin: '0 auto',
                        padding: '0 20px 48px',
                    }}>
                        <h2 style={{
                            fontSize: 22,
                            fontWeight: 800,
                            color: 'var(--먹)',
                            marginBottom: 20,
                        }}>
                            추천 AI 멘토
                        </h2>
                        <div style={{
                            display: 'flex',
                            gap: 20,
                            overflowX: 'auto',
                            paddingBottom: 12,
                            scrollbarWidth: 'none',
                        }}>
                            {mentors.slice(0, 3).map((m: MentorCardData) => (
                                <Link
                                    key={m.id}
                                    href={`/${m.id}`}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        minWidth: 240,
                                        background: 'var(--카드)',
                                        borderRadius: 'var(--둥근)',
                                        overflow: 'hidden',
                                        textDecoration: 'none',
                                        border: '1px solid var(--선)',
                                    }}
                                >
                                    <div style={{
                                        position: 'relative',
                                        aspectRatio: '1',
                                        background: 'var(--샌드)',
                                    }}>
                                        {(m.avatar_url || MENTOR_IMAGES[m.name]) && (
                                            <Image
                                                src={m.avatar_url || MENTOR_IMAGES[m.name] || ''}
                                                alt={m.name}
                                                fill
                                                sizes="240px"
                                                style={{ objectFit: 'cover' }}
                                            />
                                        )}
                                    </div>
                                    <div style={{ padding: 16 }}>
                                        <h3 style={{
                                            fontSize: 17,
                                            fontWeight: 700,
                                            color: 'var(--먹)',
                                            marginBottom: 4,
                                        }}>
                                            {m.name}
                                        </h3>
                                        <p style={{
                                            fontSize: 14,
                                            color: 'var(--먹연)',
                                            lineHeight: 1.4,
                                        }}>
                                            {m.title || m.description}
                                        </p>
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
