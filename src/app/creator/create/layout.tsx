import type { Metadata } from 'next'

// 검색·카톡 공유 — 대표 지적 2026-09-15 「GEO·SEO 이거 페이지별로 다 심었어??」
// 안 심긴 곳이 11 군데였다. 화면 파일이 'use client' 면 거기서 metadata 를 못 내보내서 이 자리에 둔다.
export const metadata: Metadata = {
    title: '나를 닮은 AI 만들기',
    description: '내 경험으로 말하는 AI 를 만들고 팔 수 있어요. 코딩은 필요 없습니다.',
    keywords: ['나만의 AI 만들기', 'AI 캐릭터 제작', 'AI 수익화', '챗봇 만들기'],
    openGraph: {
        title: '나를 닮은 AI 만들기 — 큐리 AI',
        description: '내 경험으로 말하는 AI 를 만들고 팔 수 있어요. 코딩은 필요 없습니다.',
        type: 'website',
        url: 'https://www.curi-ai.com/creator/create',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '나를 닮은 AI 만들기 — 큐리 AI' }],
    },
    twitter: { card: 'summary_large_image', title: '나를 닮은 AI 만들기 — 큐리 AI', description: '내 경험으로 말하는 AI 를 만들고 팔 수 있어요. 코딩은 필요 없습니다.', images: ['/og-image.png'] },
    alternates: { canonical: 'https://www.curi-ai.com/creator/create' },
    robots: { index: true, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
