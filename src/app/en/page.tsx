import type { Metadata } from 'next'
import Link from 'next/link'

// 해외 방문자가 처음 만나는 유일한 영어 화면이다.
// 서비스 화면은 아직 한국어 전용이라, 여기서 무엇을 하는 곳인지만 정확히 알린다.
export const metadata: Metadata = {
    // 루트 layout 의 '%s — 큐리 AI' 틀을 쓰면 영어 화면 제목에 한글이 붙는다
    title: { absolute: 'Curi AI — Turn your experience into an AI that works for you' },
    description:
        'Build an AI from what you already know, share it with the people who need it, and earn from it. No coding required.',
    alternates: {
        canonical: '/en',
        languages: {
            'ko-KR': '/',
            en: '/en',
        },
    },
    openGraph: {
        title: 'Curi AI — Turn your experience into an AI that works for you',
        description:
            'Build an AI from what you already know, share it, and earn from it. No coding required.',
        url: 'https://www.curi-ai.com/en',
        locale: 'en_US',
        type: 'website',
    },
}

// 색은 globals.css 의 토큰과 같은 값을 쓴다(서버 컴포넌트라 var() 대신 값으로 적는다)
const 진초록 = '#0B4A2A'
const 연두 = '#22c55e'
const 형광 = '#D8F94A'
const 종이 = '#F6F7F4'
const 먹 = '#111813'
const 먹연 = '#5C6660'

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
        <div lang="en" style={{ minHeight: '100dvh', background: 종이, color: 먹 }}>
            <header
                style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 50,
                    background: 'rgba(246,247,244,0.95)',
                    backdropFilter: 'blur(20px)',
                    borderBottom: '1px solid #e7e9e4',
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
                    <Link
                        href="/en"
                        style={{
                            fontSize: 20,
                            fontWeight: 800,
                            letterSpacing: '-0.04em',
                            color: 진초록,
                            textDecoration: 'none',
                        }}
                    >
                        🤖 Curi AI
                    </Link>
                    <Link
                        href="/"
                        style={{ fontSize: 15, color: 먹연, textDecoration: 'none', fontWeight: 600 }}
                    >
                        한국어
                    </Link>
                </div>
            </header>

            <main style={{ maxWidth: 900, margin: '0 auto', padding: '0 clamp(16px, 4vw, 40px) 80px' }}>
                <section
                    style={{
                        background: 진초록,
                        color: '#fff',
                        borderRadius: 28,
                        padding: 'clamp(32px, 7vw, 64px)',
                        marginTop: 28,
                    }}
                >
                    <span
                        style={{
                            display: 'inline-block',
                            background: 형광,
                            color: 진초록,
                            fontSize: 14,
                            fontWeight: 700,
                            padding: '6px 14px',
                            borderRadius: 999,
                            marginBottom: 20,
                        }}
                    >
                        No coding required
                    </span>
                    <h1
                        style={{
                            fontSize: 'clamp(34px, 9vw, 56px)',
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
                            fontSize: 17,
                            lineHeight: 1.7,
                            marginTop: 20,
                            marginBottom: 32,
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
                            minHeight: 52,
                            padding: '0 28px',
                            background: 연두,
                            color: '#fff',
                            fontSize: 17,
                            fontWeight: 700,
                            borderRadius: 999,
                            textDecoration: 'none',
                        }}
                    >
                        Start for free
                    </Link>
                </section>

                <section style={{ marginTop: 48 }}>
                    <h2
                        style={{
                            fontSize: 'clamp(22px, 5.5vw, 30px)',
                            fontWeight: 800,
                            letterSpacing: '-0.02em',
                            marginBottom: 24,
                        }}
                    >
                        How it works
                    </h2>
                    <div
                        style={{
                            display: 'grid',
                            gap: 16,
                            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        }}
                    >
                        {steps.map((s) => (
                            <div
                                key={s.n}
                                style={{
                                    background: '#fff',
                                    border: '1px solid #e7e9e4',
                                    borderRadius: 20,
                                    padding: 28,
                                }}
                            >
                                <div
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 999,
                                        background: 형광,
                                        color: 진초록,
                                        fontWeight: 800,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginBottom: 16,
                                    }}
                                >
                                    {s.n}
                                </div>
                                <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>
                                    {s.title}
                                </h3>
                                <p style={{ fontSize: 15, lineHeight: 1.7, color: 먹연, margin: 0 }}>
                                    {s.body}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                <section
                    style={{
                        marginTop: 48,
                        background: '#fff',
                        border: '1px solid #e7e9e4',
                        borderRadius: 20,
                        padding: 'clamp(24px, 5vw, 40px)',
                    }}
                >
                    <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 12px' }}>
                        Who this is for
                    </h2>
                    <p style={{ fontSize: 16, lineHeight: 1.8, color: 먹연, margin: 0 }}>
                        People whose knowledge lives in their head rather than in a product. Coaches,
                        consultants, writers, teachers, and anyone who has answered the same question
                        a hundred times and wishes it could answer itself.
                    </p>
                    <p style={{ fontSize: 15, lineHeight: 1.8, color: 먹연, marginTop: 16, marginBottom: 0 }}>
                        The service interface is currently in Korean. An English interface is on the
                        way. If you would like to be told when it opens, start with a free account.
                    </p>
                </section>
            </main>

            <footer
                style={{
                    borderTop: '1px solid #e7e9e4',
                    padding: '28px clamp(16px, 4vw, 40px) 48px',
                }}
            >
                <div style={{ maxWidth: 900, margin: '0 auto', fontSize: 13, color: 먹연 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <Link href="/terms" style={{ color: 먹연, textDecoration: 'none' }}>
                            Terms
                        </Link>
                        <span style={{ color: '#d1d5db' }}>|</span>
                        <Link href="/privacy" style={{ color: 먹연, textDecoration: 'none' }}>
                            Privacy
                        </Link>
                    </div>
                    <div style={{ color: '#9aa39d' }}>
                        Mission-driven Inc. Seoul, Republic of Korea.
                    </div>
                </div>
            </footer>
        </div>
    )
}
