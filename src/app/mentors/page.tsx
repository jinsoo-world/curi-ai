export const revalidate = 30 // 30초마다 재생성 (ISR) — 멘토 변경사항 빠르게 반영

import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { getActiveMentors, MENTOR_IMAGES } from '@/domains/mentor'
import { MembershipBanner } from '@/components/MembershipBanner'
import type { MentorCardData } from '@/domains/mentor'
import NotificationBanner from './NotificationBanner'
import AppSidebar from '@/components/AppSidebar'
import CreditClaimWrapper from './CreditClaimWrapper'
import MentorMatchHero from './MentorMatchHero'
import { Suspense } from 'react'

export const metadata: Metadata = {
    title: '멘토 선택 — 큐리 AI',
    description: 'AI를 선택하고, 콘텐츠 수익화·브랜딩·글쓰기·마케팅에 대해 24시간 대화하세요.',
    openGraph: {
        title: '멘토 선택 — 큐리 AI',
        description: 'AI를 선택하고 24시간 대화하세요. 콘텐츠 수익화, 브랜딩, 글쓰기 전문가가 함께합니다.',
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

/* ─── Mentor Card (Web: wide, responsive) ─── */
function MentorCard({
    name, title, description, questions, imageSrc, index, keywords,
}: {
    name: string; title: string; description: string; questions: string[]; imageSrc: string; index: number; keywords?: string[];
}) {
    return (
        <article
            className="animate-slide-up"
            style={{
                background: '#fff',
                borderRadius: 20,
                border: '1px solid #f0f0f0',
                boxShadow: '0 2px 16px rgba(0,0,0,0.06)',
                overflow: 'hidden',
                transition: 'transform 250ms ease, box-shadow 250ms ease',
                animationDelay: `${index * 80}ms`,
            }}
        >
            {/* Mentor Photo */}
            <div style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '1 / 1',
                background: 'linear-gradient(135deg, #f0fdf4 0%, #e8f5e9 50%, #f0f9ff 100%)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                {imageSrc && !imageSrc.includes('undefined') ? (
                    <Image
                        src={imageSrc}
                        alt={`${name} 멘토`}
                        fill
                        style={{ objectFit: 'cover' }}
                        sizes="(max-width: 768px) 100vw, 33vw"
                    />
                ) : (
                    /* 이미지 없으면 로고 흐릿하게 */
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 12,
                        opacity: 0.25,
                    }}>
                        <Image
                            src="/logo.png"
                            alt="큐리 AI"
                            width={80}
                            height={80}
                            style={{ borderRadius: 20, filter: 'grayscale(30%)' }}
                        />
                        <span style={{ fontSize: 14, color: '#6b7280', fontWeight: 500 }}>AI</span>
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="mentor-card-info" style={{ padding: '20px 20px 24px' }}>
                {/* 핵심 키워드 태그 */}
                {keywords && keywords.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                        {keywords.slice(0, 3).map((kw, i) => (
                            <span key={i} style={{
                                fontSize: 12, fontWeight: 600,
                                color: '#6b7280', background: '#f3f4f6',
                                borderRadius: 6, padding: '3px 10px',
                                letterSpacing: '-0.01em',
                            }}>
                                #{kw}
                            </span>
                        ))}
                    </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <h2 style={{
                        fontSize: 24, fontWeight: 800, color: '#18181b',
                        letterSpacing: '-0.02em', margin: 0,
                    }}>
                        {name}
                    </h2>
                    <span style={{
                        fontSize: 13, fontWeight: 600, color: '#16a34a',
                        background: '#f0fdf4', borderRadius: 100,
                        padding: '4px 12px',
                    }}>
                        AI
                    </span>
                </div>

                <p style={{
                    fontSize: 16, color: '#6b7280', margin: 0,
                    fontWeight: 500,
                }}>
                    {title}
                </p>


            </div>
        </article>
    )
}

export default async function MentorsPage() {
    const mentors = await getActiveMentors()

    return (
        <div style={{ minHeight: '100dvh', background: '#f8f9fa' }} role="document">

            {/* ─── Sidebar ─── */}
            <AppSidebar />

            {/* ─── Credit Claim Modal (client, wrapped in Suspense for searchParams) ─── */}
            <Suspense fallback={null}>
                <CreditClaimWrapper />
            </Suspense>

            {/* ─── Main Content (offset by sidebar on desktop) ─── */}
            <div className="sidebar-content" style={{
                marginLeft: 240, /* desktop: offset by sidebar */
                minHeight: '100dvh',
            }}>

                {/* ─── Membership Top Banner ─── */}
                <MembershipBanner />

                {/* ─── Hero ─── */}
                <section className="mentors-hero" style={{
                    maxWidth: 1000, margin: '0 auto',
                    padding: '48px 40px 24px',
                }}>
                    <h1 style={{
                        fontSize: 38, fontWeight: 800, color: '#18181b',
                        lineHeight: 1.35, letterSpacing: '-0.03em', margin: 0,
                    }}>
                        오늘은 어떤 이야기를{' '}
                        <span style={{
                            background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            나눠볼까요?
                        </span>
                    </h1>
                    <p style={{ fontSize: 17, color: '#9ca3af', marginTop: 12 }}>
                        나만의 AI와 24시간 대화하고, 직접 AI를 만들어보세요.
                    </p>
                </section>

                {/* ─── Notification Banner ─── */}
                <NotificationBanner />

                {/* ─── AI 멘토 매칭 히어로 ─── */}
                <MentorMatchHero />

                {/* ─── Mentor Grid ─── */}
                <main>
                    <section className="mentors-grid-section" style={{
                        maxWidth: 1000, margin: '0 auto',
                        padding: '0 40px 80px',
                    }}>
                        <div className="mentors-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: 24,
                        }}>
                            {mentors.length > 0
                                ? mentors.map((mentor: MentorCardData, index: number) => (
                                    <Link key={mentor.id} href={`/chat/${mentor.id}`} aria-label={`${mentor.name} 멘토와 대화하기`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                        <MentorCard
                                            name={mentor.name} title={mentor.title}
                                            description={mentor.description}
                                            questions={mentor.sample_questions || []}
                                            imageSrc={mentor.avatar_url || MENTOR_IMAGES[mentor.name] || ''}
                                            index={index}
                                            keywords={mentor.expertise}
                                        />
                                    </Link>
                                ))
                                : fallbackMentors.map((m, index) => (
                                    <Link key={m.id} href={`/chat/${m.id}`} aria-label={`${m.name} 멘토와 대화하기`} style={{ textDecoration: 'none', color: 'inherit' }}>
                                        <MentorCard
                                            key={m.id} name={m.name} title={m.title}
                                            description={m.desc} questions={m.questions}
                                            imageSrc={MENTOR_IMAGES[m.name] || '/mentors/passion-jin.png'}
                                            index={index}
                                        />
                                    </Link>
                                ))}
                        </div>
                    </section>
                </main>

                {/* ─── Footer ─── */}
                <footer className="mentors-footer" style={{
                    borderTop: '1px solid #e5e7eb',
                    background: '#f9fafb',
                    padding: '36px 40px 100px',
                }}>
                    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                        {/* 로고 + 회사명 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                            <img src="/logo.png" alt="큐리 AI" style={{ width: 28, height: 28, borderRadius: 6 }} />
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>큐리 AI</span>
                        </div>

                        {/* 사업자 정보 */}
                        <div style={{
                            fontSize: 12, color: '#9ca3af', lineHeight: 1.9,
                            letterSpacing: '-0.01em',
                        }}>
                            <div>미션드리븐 (대표 : 김진수) ㅣ curious@mission-driven.kr</div>
                            <div>사업자등록번호 : 277-88-02697 ㅣ 통신판매번호 : 2023-서울마포-2003</div>
                            <div>유선번호 : 1533-0701</div>
                            <div>사무실 : 서울특별시 마포구 신촌로2길 19 플랫폼D 서울디자인창업센터 4층</div>
                        </div>

                        {/* 정책 링크 */}
                        <div style={{
                            display: 'flex', gap: 4, marginTop: 20,
                            fontSize: 12, color: '#9ca3af',
                            flexWrap: 'wrap',
                        }}>
                            <Link href="/privacy" style={{ color: '#6b7280', textDecoration: 'none', fontWeight: 600 }}>
                                개인정보처리방침
                            </Link>
                            <span style={{ color: '#d1d5db' }}>ㅣ</span>
                            <Link href="/terms" style={{ color: '#6b7280', textDecoration: 'none' }}>
                                서비스이용약관
                            </Link>
                        </div>

                        {/* 카피라이트 */}
                        <div style={{
                            fontSize: 11, color: '#d1d5db', marginTop: 16,
                        }}>
                            Copyright © 미션드리븐 All rights reserved.
                        </div>
                    </div>
                </footer>
            </div>

            {/* ─── Responsive CSS ─── */}
            <style>{`
                @media (max-width: 768px) {
                    .sidebar-content {
                        margin-left: 0 !important;
                        padding-bottom: 72px;
                    }
                    .mentors-hero {
                        padding: 32px 20px 16px !important;
                    }
                    .mentors-hero h1 {
                        font-size: 28px !important;
                    }
                    .mentors-grid-section {
                        padding: 0 16px 40px !important;
                    }
                    .mentors-grid {
                        grid-template-columns: repeat(2, 1fr) !important;
                        gap: 12px !important;
                    }
                    .mentor-questions {
                        display: none !important;
                    }
                    .mentor-card-info {
                        padding: 12px 12px 16px !important;
                    }
                    .mentor-card-info h2 {
                        font-size: 17px !important;
                    }
                    .mentor-card-info p:first-of-type {
                        font-size: 12px !important;
                        margin-bottom: 4px !important;
                    }
                    .mentor-card-info p:last-of-type {
                        font-size: 12px !important;
                        margin-bottom: 0 !important;
                        -webkit-line-clamp: 1 !important;
                    }
                    .mentor-card-info span {
                        font-size: 10px !important;
                        padding: 2px 8px !important;
                    }
                    .mentors-footer {
                        padding: 24px 20px 80px !important;
                    }
                }
            `}</style>
        </div>
    )
}
