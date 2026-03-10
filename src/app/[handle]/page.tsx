export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserByHandle } from '@/domains/user'
import { getMentorsByCreator, MENTOR_IMAGES } from '@/domains/mentor'
import type { MentorCardData } from '@/domains/mentor'

interface PageProps {
    params: Promise<{ handle: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { handle } = await params
    const cleanHandle = handle.startsWith('%40')
        ? decodeURIComponent(handle).slice(1)
        : handle

    const db = createAdminClient()
    const user = await getUserByHandle(db, cleanHandle)

    if (!user) {
        return { title: '크리에이터를 찾을 수 없습니다 — 큐리 AI' }
    }

    const name = user.display_name || cleanHandle
    return {
        title: `${name} — 큐리 AI`,
        description: `${name}의 AI 멘토와 대화를 시작하세요.`,
        openGraph: {
            title: `${name} — 큐리 AI`,
            description: `${name}의 AI 멘토와 대화를 시작하세요.`,
        },
    }
}

function MentorCard({
    mentor, imageSrc, index,
}: {
    mentor: MentorCardData; imageSrc: string; index: number
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
            {/* AI Avatar */}
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
                        alt={`${mentor.name} AI`}
                        fill
                        style={{ objectFit: 'cover' }}
                        sizes="(max-width: 768px) 100vw, 33vw"
                    />
                ) : (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column' as const,
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
            <div style={{ padding: '20px 20px 24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <h3 style={{
                        fontSize: 22, fontWeight: 800, color: '#18181b',
                        letterSpacing: '-0.02em', margin: 0,
                    }}>
                        {mentor.name}
                    </h3>
                    <span style={{
                        fontSize: 12, fontWeight: 600, color: '#16a34a',
                        background: '#f0fdf4', borderRadius: 100,
                        padding: '3px 10px',
                    }}>
                        AI
                    </span>
                </div>

                <p style={{
                    fontSize: 15, color: '#6b7280', margin: '0 0 12px',
                    fontWeight: 500,
                }}>
                    {mentor.title}
                </p>

                {mentor.description && (
                    <p style={{
                        fontSize: 14, color: '#9ca3af', lineHeight: 1.6, margin: '0 0 14px',
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                    }}>
                        {mentor.description}
                    </p>
                )}

                {/* Sample Questions */}
                {mentor.sample_questions?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {mentor.sample_questions.slice(0, 2).map((q, i) => (
                            <span
                                key={i}
                                style={{
                                    fontSize: 13, color: '#16a34a', lineHeight: 1.4,
                                    background: '#f0fdf4', borderRadius: 100,
                                    padding: '5px 14px', border: '1px solid #dcfce7',
                                }}
                            >
                                &ldquo;{q}&rdquo;
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </article>
    )
}

export default async function CreatorProfilePage({ params }: PageProps) {
    const { handle } = await params

    // @ prefix 제거 (URL이 /@handle 형태로 올 수 있음)
    const cleanHandle = handle.startsWith('%40')
        ? decodeURIComponent(handle).slice(1)
        : handle.startsWith('@')
            ? handle.slice(1)
            : handle

    const db = createAdminClient()
    const user = await getUserByHandle(db, cleanHandle)

    if (!user) {
        notFound()
    }

    const mentors = await getMentorsByCreator(db, user.id)
    const displayName = user.display_name || cleanHandle

    return (
        <div style={{ minHeight: '100dvh', background: '#f8f9fa' }}>
            {/* ── Hero / Profile Header ── */}
            <header style={{
                background: 'linear-gradient(135deg, #f0fdf4 0%, #e8f5e9 40%, #f0f9ff 100%)',
                padding: '48px 20px 40px',
                textAlign: 'center' as const,
            }}>
                {/* Avatar */}
                <div style={{
                    width: 100, height: 100, borderRadius: '50%',
                    margin: '0 auto 16px',
                    overflow: 'hidden',
                    border: '4px solid #fff',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    {user.avatar_url ? (
                        <Image
                            src={user.avatar_url}
                            alt={displayName}
                            width={100}
                            height={100}
                            style={{ objectFit: 'cover' }}
                        />
                    ) : (
                        <div style={{
                            width: '100%', height: '100%',
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 36, fontWeight: 800,
                        }}>
                            {displayName.charAt(0)}
                        </div>
                    )}
                </div>

                {/* Name */}
                <h1 style={{
                    fontSize: 28, fontWeight: 800, color: '#18181b',
                    letterSpacing: '-0.02em', margin: '0 0 4px',
                }}>
                    {displayName}
                </h1>

                {/* Handle */}
                <p style={{
                    fontSize: 15, color: '#16a34a', margin: '0 0 8px',
                    fontWeight: 600,
                }}>
                    @{cleanHandle}
                </p>

                {/* Subtitle */}
                <p style={{
                    fontSize: 15, color: '#9ca3af', margin: 0,
                    maxWidth: 400, marginLeft: 'auto', marginRight: 'auto',
                }}>
                    AI 멘토와 24시간 대화하세요
                </p>
            </header>

            {/* ── AI Mentor Grid ── */}
            <main style={{
                maxWidth: 900, margin: '0 auto',
                padding: '32px 20px 80px',
            }}>
                {mentors.length > 0 ? (
                    <>
                        <h2 style={{
                            fontSize: 20, fontWeight: 700, color: '#18181b',
                            margin: '0 0 20px',
                        }}>
                            🤖 {displayName}의 AI ({mentors.length})
                        </h2>

                        <div className="handle-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                            gap: 20,
                        }}>
                            {mentors.map((mentor, index) => (
                                <Link
                                    key={mentor.id}
                                    href={`/chat/${mentor.id}`}
                                    aria-label={`${mentor.name} AI와 대화하기`}
                                    style={{ textDecoration: 'none', color: 'inherit' }}
                                >
                                    <MentorCard
                                        mentor={mentor}
                                        imageSrc={mentor.avatar_url || MENTOR_IMAGES[mentor.name] || ''}
                                        index={index}
                                    />
                                </Link>
                            ))}
                        </div>
                    </>
                ) : (
                    /* 아직 AI가 없을 때 */
                    <div style={{
                        textAlign: 'center' as const,
                        padding: '60px 20px',
                        color: '#9ca3af',
                    }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🚀</div>
                        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#6b7280', margin: '0 0 8px' }}>
                            아직 준비 중이에요
                        </h2>
                        <p style={{ fontSize: 15, margin: 0 }}>
                            {displayName}의 AI가 곧 공개됩니다!
                        </p>
                    </div>
                )}
            </main>

            {/* ── Footer ── */}
            <footer style={{
                borderTop: '1px solid #f0f0f0',
                padding: '24px 20px 40px',
                textAlign: 'center' as const,
            }}>
                <Link
                    href="/mentors"
                    style={{
                        fontSize: 14, color: '#16a34a',
                        textDecoration: 'none', fontWeight: 600,
                    }}
                >
                    큐리 AI 둘러보기 →
                </Link>
                <p style={{ fontSize: 13, color: '#d1d5db', marginTop: 12 }}>
                    © 2026 큐리 AI — 나를 아는 멘토
                </p>
            </footer>

            {/* ── Responsive + Animations ── */}
            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-slide-up {
                    animation: slideUp 400ms ease-out both;
                }
                @media (max-width: 640px) {
                    .handle-grid {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
        </div>
    )
}
