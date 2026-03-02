// 인사이트 공유 페이지 — OG 메타태그 포함
import { Metadata } from 'next'
import { getInsightById } from '@/domains/insight'
import Link from 'next/link'

interface PageProps {
    params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { id } = await params
    const insight = await getInsightById(id)

    if (!insight) {
        return { title: '인사이트를 찾을 수 없어요 | 큐리 AI' }
    }

    return {
        title: `💡 ${insight.title} | 큐리 AI`,
        description: insight.content,
        openGraph: {
            title: `💡 ${insight.title}`,
            description: insight.content,
            type: 'article',
            siteName: '큐리 AI — 나를 아는 멘토에게 물어보세요',
            images: [{
                url: '/og-insight.png',
                width: 1200,
                height: 630,
                alt: insight.title,
            }],
        },
        twitter: {
            card: 'summary_large_image',
            title: `💡 ${insight.title}`,
            description: insight.content,
        },
    }
}

export default async function InsightSharePage({ params }: PageProps) {
    const { id } = await params
    const insight = await getInsightById(id)

    if (!insight) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100dvh',
                background: '#faf8f5',
                padding: 32,
                textAlign: 'center',
            }}>
                <span style={{ fontSize: 48, marginBottom: 16 }}>🔍</span>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#18181b', margin: '0 0 8px' }}>
                    인사이트를 찾을 수 없어요
                </h1>
                <p style={{ fontSize: 15, color: '#71717a', margin: '0 0 24px' }}>
                    삭제되었거나 잘못된 링크일 수 있어요.
                </p>
                <Link href="/mentors" style={{
                    background: '#22c55e',
                    color: '#fff',
                    padding: '12px 24px',
                    borderRadius: 12,
                    fontWeight: 600,
                    textDecoration: 'none',
                    fontSize: 15,
                }}>
                    큐리 AI 시작하기
                </Link>
            </div>
        )
    }

    return (
        <div style={{
            minHeight: '100dvh',
            background: 'linear-gradient(180deg, #f0f9ff 0%, #faf8f5 40%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
        }}>
            {/* 헤더 */}
            <header style={{
                width: '100%',
                maxWidth: 640,
                padding: '24px 20px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
            }}>
                <Link href="/mentors" style={{
                    textDecoration: 'none',
                    color: '#18181b',
                    fontWeight: 700,
                    fontSize: 18,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    🧠 큐리 AI
                </Link>
            </header>

            {/* 인사이트 카드 */}
            <main style={{
                width: '100%',
                maxWidth: 640,
                padding: '0 20px 40px',
            }}>
                <div style={{
                    background: 'linear-gradient(135deg, #f0f9ff 0%, #f5f3ff 50%, #fdf2f8 100%)',
                    borderRadius: 20,
                    padding: '32px 28px',
                    border: '1px solid rgba(99, 102, 241, 0.12)',
                    boxShadow: '0 8px 32px rgba(99, 102, 241, 0.1)',
                }}>
                    {/* 뱃지 */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 20,
                    }}>
                        <span style={{ fontSize: 28 }}>💡</span>
                        <span style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#6366f1',
                            background: 'rgba(99, 102, 241, 0.1)',
                            padding: '4px 10px',
                            borderRadius: 8,
                        }}>
                            🤖 AI 인사이트
                        </span>
                    </div>

                    {/* 제목 */}
                    <h1 style={{
                        margin: '0 0 16px',
                        fontSize: 24,
                        fontWeight: 800,
                        color: '#18181b',
                        lineHeight: 1.3,
                    }}>
                        {insight.title}
                    </h1>

                    {/* 내용 */}
                    <p style={{
                        margin: '0 0 20px',
                        fontSize: 16,
                        color: '#374151',
                        lineHeight: 1.8,
                    }}>
                        {insight.content}
                    </p>

                    {/* 태그 */}
                    {insight.tags.length > 0 && (
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 8,
                            marginBottom: 20,
                        }}>
                            {insight.tags.map((tag: string, i: number) => (
                                <span key={i} style={{
                                    fontSize: 13,
                                    color: '#8b5cf6',
                                    background: 'rgba(139, 92, 246, 0.08)',
                                    padding: '4px 12px',
                                    borderRadius: 12,
                                    fontWeight: 500,
                                }}>
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* 멘토 정보 */}
                    <div style={{
                        borderTop: '1px solid rgba(0,0,0,0.06)',
                        paddingTop: 16,
                        fontSize: 14,
                        color: '#71717a',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}>
                        <span>— {insight.mentor_name} 멘토와의 대화에서</span>
                    </div>
                </div>

                {/* CTA */}
                <div style={{
                    textAlign: 'center',
                    marginTop: 32,
                }}>
                    <p style={{
                        fontSize: 15,
                        color: '#71717a',
                        marginBottom: 16,
                    }}>
                        나도 AI 멘토와 대화하고 인사이트를 얻어보세요
                    </p>
                    <Link href="/mentors" style={{
                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                        color: '#fff',
                        padding: '14px 32px',
                        borderRadius: 14,
                        fontWeight: 700,
                        textDecoration: 'none',
                        fontSize: 16,
                        display: 'inline-block',
                        boxShadow: '0 4px 16px rgba(34,197,94,0.3)',
                    }}>
                        큐리 AI 시작하기 →
                    </Link>
                </div>
            </main>
        </div>
    )
}
