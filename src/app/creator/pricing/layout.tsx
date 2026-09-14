import type { Metadata } from 'next'

// 검색·카톡 공유 — 대표 지적 2026-09-15 「GEO·SEO 이거 페이지별로 다 심었어??」
// 안 심긴 곳이 11 군데였다. 화면 파일이 'use client' 면 거기서 metadata 를 못 내보내서 이 자리에 둔다.
export const metadata: Metadata = {
    title: '리더 요금 — 큐리 AI',
    description: '내 AI 를 팔 때 드는 값과 수수료를 안내합니다.',
    keywords: ['AI 판매 수수료', '크리에이터 요금'],
    openGraph: {
        title: '리더 요금 — 큐리 AI',
        description: '내 AI 를 팔 때 드는 값과 수수료를 안내합니다.',
        type: 'website',
        url: 'https://www.curi-ai.com/creator/pricing',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '리더 요금 — 큐리 AI' }],
    },
    twitter: { card: 'summary_large_image', title: '리더 요금 — 큐리 AI', description: '내 AI 를 팔 때 드는 값과 수수료를 안내합니다.', images: ['/og-image.png'] },
    alternates: { canonical: 'https://www.curi-ai.com/creator/pricing' },
    robots: { index: true, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
