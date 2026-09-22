import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import AppSidebar from '@/components/AppSidebar'
import CloverIcon from '@/components/ui/CloverIcon'

/**
 * 프로필 사진 도구 허브 (2026-09-22 Delphi 스타일 UX 개편)
 * 
 * CEO 요구사항: 프로필 사진 생성 도구를 별도 탭/섹션으로 분리
 * - 메인 제품(AI 멘토)과 명확히 구분
 * - 모든 사진 도구를 한 곳에 모아 보여줌
 * - Delphi 스타일: 부드러운 샌드 톤, 넉넉한 라운딩, 깔끔한 카드 레이아웃
 */

export const metadata: Metadata = {
    title: '프로필 사진 만들기',
    description: '사진 한 장으로 프로페셔널한 프로필 사진을 만들어보세요. 강사 프로필, 배우 프로필, 화질 개선까지.',
    openGraph: {
        title: '프로필 사진 만들기 — 큐리 AI',
        description: '강사 프로필, 배우 프로필, 화질 개선 도구를 제공합니다.',
    },
}

// CEO 요구 2026-09-22: 강사/배우/화질개선 3개만 유지
// 2026-09-22 이미지 품질 개선: 제목 베이킹 없는 깨끗한 초상화 샘플 사용
const PHOTO_TOOLS = [
    {
        id: 'teacher',
        title: '강사 프로필',
        desc: '온라인 강의와 재취업에 쓸 수 있는 전문가 프로필 사진',
        href: '/tools/teacher-photo',
        img: '/samples/teach-w1.webp',
        cost: 30,
    },
    {
        id: 'actor',
        title: '배우 프로필',
        desc: '오디션과 캐스팅에 쓸 수 있는 배우 프로필',
        href: '/tools/actor-photo',
        img: '/samples/act-m1.webp',
        cost: 30,
    },
    {
        id: 'enhance',
        title: '화질 개선',
        desc: '낡고 흐릿한 사진을 선명하게 복원해드립니다',
        href: '/tools/enhance',
        img: '/samples/after-woman.webp',
        cost: 20,
    },
]

export default function ToolsHubPage() {
    return (
        <div style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <AppSidebar />
            
            <main style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 20px 90px' }}>
                {/* 페이지 헤더 */}
                <header style={{ marginBottom: 48, textAlign: 'center' }}>
                    <h1 style={{
                        fontSize: 'clamp(32px, 7vw, 48px)',
                        fontWeight: 800,
                        color: 'var(--먹)',
                        marginBottom: 16,
                        letterSpacing: '-0.03em',
                    }}>
                        프로필 사진 만들기
                    </h1>
                    <p style={{
                        fontSize: 18,
                        color: 'var(--먹연)',
                        lineHeight: 1.6,
                        maxWidth: 560,
                        margin: '0 auto',
                    }}>
                        사진 한 장만 올리면 됩니다. 얼굴은 그대로 두고 옷과 배경만 바꿔드려요.
                    </p>
                </header>

                {/* 도구 그리드 */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 24,
                }}>
                    {PHOTO_TOOLS.map(tool => (
                        <Link
                            key={tool.id}
                            href={tool.href}
                            className="tool-card"
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                background: 'var(--카드)',
                                borderRadius: 'var(--둥근)',
                                overflow: 'hidden',
                                textDecoration: 'none',
                                border: '1px solid var(--선)',
                                transition: 'all 200ms ease',
                            }}
                        >
                            {/* 도구 이미지 */}
                            <div style={{
                                position: 'relative',
                                aspectRatio: '4 / 5',
                                background: 'var(--샌드)',
                                overflow: 'hidden',
                            }}>
                                {tool.img && (
                                    <Image
                                        src={tool.img}
                                        alt={tool.title}
                                        fill
                                        sizes="(max-width: 768px) 50vw, 33vw"
                                        style={{ objectFit: 'cover', objectPosition: 'center 15%' }}
                                    />
                                )}
                            </div>

                            {/* 도구 정보 */}
                            <div style={{ padding: 20 }}>
                                <h3 style={{
                                    fontSize: 19,
                                    fontWeight: 700,
                                    color: 'var(--먹)',
                                    marginBottom: 8,
                                }}>
                                    {tool.title}
                                </h3>
                                <p style={{
                                    fontSize: 15,
                                    color: 'var(--먹연)',
                                    lineHeight: 1.5,
                                    marginBottom: 12,
                                }}>
                                    {tool.desc}
                                </p>
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '6px 12px',
                                    borderRadius: 999,
                                    background: 'var(--샌드)',
                                    fontSize: 14,
                                    fontWeight: 700,
                                    color: 'var(--먹)',
                                }}>
                                    <CloverIcon size={16} />
                                    {tool.cost}개
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>

                {/* 하단 안내 */}
                <footer style={{
                    marginTop: 64,
                    padding: 32,
                    background: 'var(--샌드)',
                    borderRadius: 'var(--둥근)',
                    textAlign: 'center',
                }}>
                    <p style={{
                        fontSize: 15,
                        color: 'var(--먹연)',
                        lineHeight: 1.6,
                        marginBottom: 16,
                    }}>
                        모든 도구는 얼굴과 나이를 그대로 유지합니다. 실물과 달라 보이지 않아요.
                    </p>
                    <Link
                        href="/mentors"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '12px 24px',
                            background: 'var(--단추)',
                            color: '#fff',
                            borderRadius: 999,
                            fontSize: 15,
                            fontWeight: 700,
                            textDecoration: 'none',
                        }}
                    >
                        AI 멘토 둘러보기
                    </Link>
                </footer>
            </main>

            <style>{`
                .tool-card:hover {
                    transform: translateY(-4px);
                    box-shadow: var(--그림자-대);
                }
                @media (max-width: 768px) {
                    main {
                        padding: 32px 16px 90px !important;
                    }
                }
            `}</style>
        </div>
    )
}
