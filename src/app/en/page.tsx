import type { Metadata } from 'next'
import Link from 'next/link'
import SetHtmlLang from './SetHtmlLang'

// 해외 방문자가 처음 만나는 유일한 영어 화면이다.
// 서비스 화면은 아직 한국어 전용이라, 여기서 무엇을 하는 곳인지만 정확히 알린다.
export const metadata: Metadata = {
    // 루트 layout 의 '%s — 큐리 AI' 틀을 쓰면 영어 화면 제목에 한글이 붙는다
    title: { absolute: 'Curi AI — Turn your experience into an AI that works for you' },
    description:
        'Build an AI from what you already know, share it with the people who need it, and earn from it. No coding required.',
    // 한국어 짝은 루트(/)가 아니라 /login 이다. 루트는 307 리다이렉트라 짝이 될 수 없다.
    alternates: {
        canonical: '/en',
        languages: {
            'ko-KR': '/login',
            'en-US': '/en',
            'x-default': '/en',
        },
    },
    // ⚠️ openGraph·twitter 는 루트 것과 합쳐지지 않고 통째로 덮인다.
    //    그래서 이미지·사이트명까지 여기서 다시 적는다. 안 적으면 공유 카드에서 사라진다.
    openGraph: {
        title: 'Curi AI — Turn your experience into an AI that works for you',
        description:
            'Build an AI from what you already know, share it, and earn from it. No coding required.',
        type: 'website',
        url: 'https://www.curi-ai.com/en',
        siteName: 'Curi AI',
        locale: 'en_US',
        images: [
            {
                url: '/og-image.png',
                width: 1200,
                height: 630,
                alt: 'Curi AI',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Curi AI — Turn your experience into an AI that works for you',
        description:
            'Build an AI from what you already know, share it, and earn from it. No coding required.',
        images: ['/og-image.png'],
    },
}

const steps = [
    {
        n: '1',
        title: 'Build your AI',
        body: 'Describe how you think and how you talk. Upload the documents you already have. Your AI is ready in minutes.',
    },
    {
        n: '2',
        title: 'Share it',
        body: 'Your AI gets its own page. Send the link to the people who keep asking you the same questions.',
    },
    {
        n: '3',
        title: 'Earn from it',
        body: 'Set it free or set a price. Your AI keeps answering while you sleep.',
    },
]

export default function EnglishLandingPage() {
    return (
        <div
            lang="en"
            style={{ minHeight: '100dvh', background: 'var(--종이)', color: 'var(--먹)' }}
        >
            <SetHtmlLang lang="en" />

            <header
                style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 50,
                    background: 'var(--종이)',
                    borderBottom: '1px solid var(--선)',
                }}
            >
                <div
                    style={{
                        maxWidth: 900,
                        margin: '0 auto',
                        padding: '0 clamp(16px, 4vw, 40px)',
                        height: 64,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <span
                        style={{
                            fontSize: 20,
                            fontWeight: 800,
                            letterSpacing: '-0.04em',
                            color: 'var(--진초록)',
                        }}
                    >
                        🤖 Curi AI
                    </span>
                    <Link
                        href="/login"
                        lang="ko"
                        hrefLang="ko"
                        style={{
                            fontSize: 'var(--글자-작)',
                            color: 'var(--먹연)',
                            textDecoration: 'none',
                            fontWeight: 600,
                        }}
                    >
                        한국어
                    </Link>
                </div>
            </header>

            <main
                style={{
                    maxWidth: 900,
                    margin: '0 auto',
                    padding: '0 clamp(16px, 4vw, 40px) var(--틈-절)',
                }}
            >
                <section
                    style={{
                        background: 'var(--진초록)',
                        color: 'var(--흰)',
                        borderRadius: 'var(--둥근-대)',
                        padding: 'clamp(32px, 7vw, 64px)',
                        marginTop: 'var(--틈-대)',
                    }}
                >
                    <span
                        style={{
                            display: 'inline-block',
                            background: 'var(--형광)',
                            color: 'var(--진초록)',
                            fontSize: 14,
                            fontWeight: 700,
                            padding: '6px 14px',
                            borderRadius: 999,
                            marginBottom: 'var(--틈)',
                        }}
                    >
                        No coding required
                    </span>
                    <h1
                        style={{
                            fontSize: 'var(--글자-초대)',
                            fontWeight: 800,
                            lineHeight: 1.15,
                            letterSpacing: '-0.03em',
                            margin: 0,
                        }}
                    >
                        Your experience,
                        <br />
                        working as an AI.
                    </h1>
                    <p
                        style={{
                            fontSize: 'var(--글자-본문)',
                            lineHeight: 1.7,
                            marginTop: 'var(--틈)',
                            marginBottom: 'var(--틈-대)',
                            color: 'rgba(255,255,255,0.86)',
                            maxWidth: 520,
                        }}
                    >
                        You have spent years learning something well. Curi AI turns that into an AI
                        other people can talk to, any hour of the day.
                    </p>
                    <Link
                        href="/login"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minHeight: 'var(--손가락)',
                            padding: '0 28px',
                            background: 'var(--단추)',
                            color: 'var(--흰)',
                            fontSize: 'var(--글자-본문)',
                            fontWeight: 700,
                            borderRadius: 999,
                            textDecoration: 'none',
                            // 초점 테두리색이 버튼 배경과 같은 연두라, 띄우지 않으면 키보드로 쓸 때 안 보인다
                            outlineOffset: 3,
                        }}
                    >
                        Start for free
                    </Link>
                </section>

                <section style={{ marginTop: 'var(--틈-절)' }}>
                    <h2
                        style={{
                            fontSize: 'var(--글자-대)',
                            fontWeight: 800,
                            letterSpacing: '-0.02em',
                            marginBottom: 'var(--틈-대)',
                        }}
                    >
                        How it works
                    </h2>
                    <div
                        style={{
                            display: 'grid',
                            gap: 'var(--틈)',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        }}
                    >
                        {steps.map((s) => (
                            <div
                                key={s.n}
                                style={{
                                    background: 'var(--흰)',
                                    border: '1px solid var(--선)',
                                    borderRadius: 'var(--둥근)',
                                    padding: 'var(--틈-대)',
                                }}
                            >
                                <div
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 999,
                                        background: 'var(--형광)',
                                        color: 'var(--진초록)',
                                        fontWeight: 800,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginBottom: 'var(--틈)',
                                    }}
                                >
                                    {s.n}
                                </div>
                                <h3
                                    style={{
                                        fontSize: 'var(--글자-중)',
                                        fontWeight: 700,
                                        margin: '0 0 var(--틈-소)',
                                    }}
                                >
                                    {s.title}
                                </h3>
                                <p
                                    style={{
                                        fontSize: 'var(--글자-작)',
                                        lineHeight: 1.7,
                                        color: 'var(--먹연)',
                                        margin: 0,
                                    }}
                                >
                                    {s.body}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                <section
                    style={{
                        marginTop: 'var(--틈-절)',
                        background: 'var(--흰)',
                        border: '1px solid var(--선)',
                        borderRadius: 'var(--둥근)',
                        padding: 'clamp(24px, 5vw, 40px)',
                    }}
                >
                    <h2
                        style={{
                            fontSize: 'var(--글자-대)',
                            fontWeight: 800,
                            margin: '0 0 var(--틈-소)',
                        }}
                    >
                        Who this is for
                    </h2>
                    <p
                        style={{
                            fontSize: 'var(--글자-본문)',
                            lineHeight: 1.8,
                            color: 'var(--먹연)',
                            margin: 0,
                        }}
                    >
                        People whose knowledge lives in their head rather than in a product. Coaches,
                        consultants, writers, teachers, and anyone who has answered the same question
                        a hundred times and wishes it could answer itself.
                    </p>
                    <p
                        style={{
                            fontSize: 'var(--글자-작)',
                            lineHeight: 1.8,
                            color: 'var(--먹연)',
                            marginTop: 'var(--틈)',
                            marginBottom: 0,
                        }}
                    >
                        The service interface is currently in Korean. An English interface is on the
                        way. If you would like to be told when it opens, start with a free account.
                    </p>
                </section>
            </main>

            <footer
                style={{
                    borderTop: '1px solid var(--선)',
                    padding: 'var(--틈-대) clamp(16px, 4vw, 40px) var(--틈-절)',
                }}
            >
                <div
                    style={{
                        maxWidth: 900,
                        margin: '0 auto',
                        fontSize: 'var(--글자-작)',
                        color: 'var(--먹연)',
                    }}
                >
                    <div style={{ display: 'flex', gap: 'var(--틈-소)', marginBottom: 10, flexWrap: 'wrap' }}>
                        <Link href="/terms" style={{ color: 'var(--먹연)', textDecoration: 'none' }}>
                            Terms
                        </Link>
                        <span aria-hidden="true">|</span>
                        <Link href="/privacy" style={{ color: 'var(--먹연)', textDecoration: 'none' }}>
                            Privacy
                        </Link>
                    </div>
                    <div>Mission-driven Inc. Seoul, Republic of Korea.</div>
                </div>
            </footer>
        </div>
    )
}
