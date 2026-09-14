export const revalidate = 30

// 코치 프로필 — 대표 지시 2026-09-14
// 「클릭하면, 그 사람 이미지 크게 보여지고 설명, SNS 링크 등 보여지게 해.
//   그 다음에 대화하기 누르면 대화창으로 이동하고」
//
// 왜 한 칸을 더 두나 = 목록에서 바로 채팅으로 넣으면 누구인지 모른 채 말을 걸어야 한다.
// 사람은 상대를 보고 나서 말을 건다.
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublicMentorById } from '@/domains/mentor'
import AppSidebar from '@/components/AppSidebar'

type Props = { params: Promise<{ mentorId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { mentorId } = await params
    const m = await getPublicMentorById(mentorId)
    if (!m) return { title: '코치 — 큐리 AI' }
    return {
        title: `${m.name} — 큐리 AI`,
        description: m.title || m.description || '',
        openGraph: {
            title: `${m.name} — 큐리 AI`,
            description: m.title || m.description || '',
            images: m.avatar_url ? [m.avatar_url] : undefined,
        },
    }
}

/** 링크가 될 만한 칸을 모은다. 없는 칸은 그냥 건너뛴다 */
function 링크모으기(m: Record<string, unknown>) {
    const 후보: { label: string; url: string }[] = []
    const 넣기 = (label: string, v: unknown) => {
        if (typeof v !== 'string') return
        const t = v.trim()
        if (!t) return
        const url = /^https?:\/\//.test(t) ? t : `https://${t.replace(/^\/+/, '')}`
        try {
            new URL(url)
        } catch {
            return
        }
        후보.push({ label, url })
    }
    넣기('유튜브', m.youtube_url)
    넣기('인스타그램', m.instagram_url)
    넣기('블로그', m.blog_url)
    넣기('스레드', m.threads_url)
    넣기('홈페이지', m.website_url ?? m.homepage_url)
    const sns = m.sns_links
    if (sns && typeof sns === 'object' && !Array.isArray(sns)) {
        for (const [k, v] of Object.entries(sns as Record<string, unknown>)) 넣기(k, v)
    }
    return 후보
}

export default async function CoachPage({ params }: Props) {
    const { mentorId } = await params
    const m = await getPublicMentorById(mentorId)
    if (!m) notFound()

    const 링크 = 링크모으기(m as Record<string, unknown>)
    const 질문: string[] = Array.isArray(m.sample_questions) ? m.sample_questions.slice(0, 4) : []
    const 분야: string[] = Array.isArray(m.expertise) ? m.expertise.slice(0, 5) : []

    return (
        <div style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <AppSidebar />

            <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 16px 120px' }}>
                <Link
                    href="/mentors"
                    style={{ display: 'inline-block', fontSize: 15, fontWeight: 700, color: 'var(--먹연)', textDecoration: 'none', marginBottom: 16 }}
                >
                    ‹ 코치 목록
                </Link>

                <div className="coach-top">
                    {/* 큰 사진 */}
                    <div
                        style={{
                            position: 'relative',
                            aspectRatio: '3 / 4',
                            borderRadius: 20,
                            overflow: 'hidden',
                            background: '#E8F2EC',
                        }}
                    >
                        {m.avatar_url ? (
                            <Image
                                src={m.avatar_url}
                                alt={`${m.name} 코치`}
                                fill
                                sizes="(max-width: 860px) 100vw, 420px"
                                quality={90}
                                priority
                                style={{ objectFit: 'cover', objectPosition: 'center 20%' }}
                            />
                        ) : (
                            <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 72, fontWeight: 900, color: 'var(--진초록)', opacity: 0.25 }}>
                                {String(m.name).slice(0, 1)}
                            </span>
                        )}
                    </div>

                    {/* 소개 */}
                    <div>
                        <h1 style={{ fontSize: 'var(--글자-대)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
                            {m.name}
                        </h1>
                        {m.title && (
                            <p style={{ fontSize: 'var(--글자-중)', color: 'var(--먹연)', margin: '0 0 16px', lineHeight: 1.5, wordBreak: 'keep-all' }}>
                                {m.title}
                            </p>
                        )}

                        {분야.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 18 }}>
                                {분야.map((c) => (
                                    <span key={c} style={{ background: '#EAF7EF', color: 'var(--진초록)', fontSize: 13, fontWeight: 700, padding: '6px 12px', borderRadius: 999 }}>
                                        {c}
                                    </span>
                                ))}
                            </div>
                        )}

                        {m.description && (
                            <p style={{ fontSize: 'var(--글자-본문)', color: 'var(--먹)', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'keep-all', margin: '0 0 20px' }}>
                                {m.description}
                            </p>
                        )}

                        {링크.length > 0 && (
                            <div style={{ marginBottom: 22 }}>
                                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--먹연)', marginBottom: 8 }}>가는 곳</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {링크.map((l) => (
                                        <a
                                            key={l.url}
                                            href={l.url}
                                            target="_blank"
                                            rel="noopener noreferrer nofollow"
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                                background: '#fff', border: '1px solid var(--선)',
                                                borderRadius: 999, padding: '9px 15px',
                                                fontSize: 14, fontWeight: 700, color: 'var(--먹)', textDecoration: 'none',
                                            }}
                                        >
                                            {l.label} ↗
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        <Link href={`/chat/${m.id}`} className="coach-cta">
                            {m.name}님과 대화하기
                        </Link>
                    </div>
                </div>

                {질문.length > 0 && (
                    <section style={{ marginTop: 40 }}>
                        <h2 style={{ fontSize: 'var(--글자-중)', fontWeight: 900, margin: '0 0 12px' }}>이런 걸 물어보세요</h2>
                        <div style={{ display: 'grid', gap: 10 }}>
                            {질문.map((q) => (
                                <Link
                                    key={q}
                                    href={`/chat/${m.id}?q=${encodeURIComponent(q)}`}
                                    style={{
                                        background: '#fff', border: '1px solid var(--선)', borderRadius: 14,
                                        padding: '16px 18px', fontSize: 'var(--글자-본문)', fontWeight: 600,
                                        color: 'var(--먹)', textDecoration: 'none', lineHeight: 1.5, wordBreak: 'keep-all',
                                    }}
                                >
                                    {q}
                                </Link>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    )
}
