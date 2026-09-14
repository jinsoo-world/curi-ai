import type { Metadata } from 'next'

// 검색·카톡 공유 — 대표 지적 2026-09-15 「GEO·SEO 이거 페이지별로 다 심었어??」
// 안 심긴 곳이 11 군데였다. 화면 파일이 'use client' 면 거기서 metadata 를 못 내보내서 이 자리에 둔다.
export const metadata: Metadata = {
    title: '서비스 이용약관',
    description: '큐리 AI 서비스 이용약관입니다.',
    keywords: ['이용약관'],
    openGraph: {
        title: '서비스 이용약관 — 큐리 AI',
        description: '큐리 AI 서비스 이용약관입니다.',
        type: 'website',
        url: 'https://www.curi-ai.com/terms',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '서비스 이용약관 — 큐리 AI' }],
    },
    twitter: { card: 'summary_large_image', title: '서비스 이용약관 — 큐리 AI', description: '큐리 AI 서비스 이용약관입니다.', images: ['/og-image.png'] },
    alternates: { canonical: 'https://www.curi-ai.com/terms' },
    robots: { index: true, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
