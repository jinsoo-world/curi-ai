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
import { getPublicMentorById, MENTOR_IMAGES } from '@/domains/mentor'
import AppSidebar from '@/components/AppSidebar'
import LinkIcon from '@/components/creator/LinkIcon'
import { 링크정리, 주소정리, 종류추측, 보일이름, getLinkKind, type CreatorLink } from '@/domains/creator/links'

type Props = { params: Promise<{ mentorId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { mentorId } = await params
    const m = await getPublicMentorById(mentorId)
    if (!m) return { title: '소개' }
    return {
        // 맨 위 layout 이 '— 큐리 AI' 를 붙인다. 여기서 또 붙이면 두 번 나온다(2026-09-16 실측)
        title: m.name,
        description: m.title || m.description || '',
        openGraph: {
            title: `${m.name} | 큐리 AI`,
            description: m.title || m.description || '',
            images: m.avatar_url ? [m.avatar_url] : undefined,
        },
    }
}

/**
 * 링크가 될 만한 칸을 모은다. 없는 칸은 그냥 건너뛴다.
 *
 * 2026-09-16 = 리더가 직접 넣는 links 칸이 생겼다(대표 지시 「개인 SNS 링크도 넣을 수 있으면 좋겠다」).
 * 옛 칸(youtube_url 등)도 그대로 읽는다 — 이미 들어 있는 값이 사라지면 안 된다.
 */
function 링크모으기(m: Record<string, unknown>): CreatorLink[] {
    const 후보: CreatorLink[] = []
    const 넣기 = (kind: string, v: unknown) => {
        const url = 주소정리(v)
        if (!url) return
        if (후보.some(x => x.url === url)) return
        후보.push({ kind: getLinkKind(kind) ? kind : 종류추측(url), url })
    }

    // 리더가 직접 넣은 것이 먼저다
    for (const l of 링크정리(m.links)) {
        if (!후보.some(x => x.url === l.url)) 후보.push(l)
    }

    넣기('youtube', m.youtube_url)
    넣기('instagram', m.instagram_url)
    넣기('blog', m.blog_url)
    넣기('threads', m.threads_url)
    넣기('home', m.website_url ?? m.homepage_url)
    const sns = m.sns_links
    if (sns && typeof sns === 'object' && !Array.isArray(sns)) {
        for (const [k, v] of Object.entries(sns as Record<string, unknown>)) 넣기(k, v)
    }
    return 후보.slice(0, 8)
}

export default async function CoachPage({ params }: Props) {
    const { mentorId } = await params
    const m = await getPublicMentorById(mentorId)
    if (!m) notFound()

    // DB 에 사진이 없는 옛 멘토는 목록과 같은 대체 사진을 쓴다
    // (대표 지적 0915 「이미지 안뜨는 거 있다」 — 목록엔 보이는데 이 화면만 비어 있었다)
    const 사진 = m.avatar_url || MENTOR_IMAGES[m.name as string] || null

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
                    ‹ 목록으로
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
                        {사진 ? (
                            <Image
                                src={사진}
                                alt={m.name}
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

                        {/* 리더의 다른 채널 — 대표 지시 2026-09-16
                            둥근 아이콘을 나란히 둔다. 글자 칩보다 알아보기 쉽고 자리도 적게 쓴다. */}
                        {링크.length > 0 && (
                            <div style={{ marginBottom: 22 }}>
                                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--먹연)', marginBottom: 9 }}>
                                    {m.name}님의 다른 곳
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                    {링크.map((l) => (
                                        <a
                                            key={l.url}
                                            href={l.url}
                                            target="_blank"
                                            rel="noopener noreferrer nofollow"
                                            title={보일이름(l)}
                                            aria-label={보일이름(l)}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                                background: '#fff', border: '1px solid var(--선)',
                                                borderRadius: 999, padding: '5px 14px 5px 5px',
                                                fontSize: 14.5, fontWeight: 700, color: 'var(--먹)', textDecoration: 'none',
                                            }}
                                        >
                                            <LinkIcon kind={l.kind} />
                                            {보일이름(l)}
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
