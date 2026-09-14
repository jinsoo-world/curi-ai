import type { Metadata } from 'next'

// 검색·카톡 공유 — 대표 지적 2026-09-15 「GEO·SEO 이거 페이지별로 다 심었어??」
// 안 심긴 곳이 11 군데였다. 화면 파일이 'use client' 면 거기서 metadata 를 못 내보내서 이 자리에 둔다.
export const metadata: Metadata = {
    title: '클로버 충전',
    description: '클로버 1개로 AI 와 한 번 대화해요. 쓴 만큼만 냅니다. 많이 담을수록 최대 48% 싸집니다.',
    keywords: ['큐리 AI 가격', '클로버 충전', 'AI 이용권'],
    openGraph: {
        title: '클로버 충전 — 큐리 AI',
        description: '클로버 1개로 AI 와 한 번 대화해요. 쓴 만큼만 냅니다. 많이 담을수록 최대 48% 싸집니다.',
        type: 'website',
        url: 'https://www.curi-ai.com/charge',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '클로버 충전 — 큐리 AI' }],
    },
    twitter: { card: 'summary_large_image', title: '클로버 충전 — 큐리 AI', description: '클로버 1개로 AI 와 한 번 대화해요. 쓴 만큼만 냅니다. 많이 담을수록 최대 48% 싸집니다.', images: ['/og-image.png'] },
    alternates: { canonical: 'https://www.curi-ai.com/charge' },
    robots: { index: true, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
