import type { Metadata } from 'next'

// 검색·카톡 공유 — 대표 지적 2026-09-15 「GEO·SEO 이거 페이지별로 다 심었어??」
// 안 심긴 곳이 11 군데였다. 화면 파일이 'use client' 면 거기서 metadata 를 못 내보내서 이 자리에 둔다.
export const metadata: Metadata = {
    title: '스토어 — 큐리 AI',
    description: '모은 클로버로 바꿀 수 있는 것들.',
    keywords: ['큐리 AI 스토어', '클로버 사용처'],
    openGraph: {
        title: '스토어 — 큐리 AI',
        description: '모은 클로버로 바꿀 수 있는 것들.',
        type: 'website',
        url: 'https://www.curi-ai.com/store',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '스토어 — 큐리 AI' }],
    },
    twitter: { card: 'summary_large_image', title: '스토어 — 큐리 AI', description: '모은 클로버로 바꿀 수 있는 것들.', images: ['/og-image.png'] },
    alternates: { canonical: 'https://www.curi-ai.com/store' },
    robots: { index: true, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
