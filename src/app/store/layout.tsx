import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

// 검색·카톡 공유 — 대표 지적 2026-09-15 「GEO·SEO 이거 페이지별로 다 심었어??」
// 안 심긴 곳이 11 군데였다. 화면 파일이 'use client' 면 거기서 metadata 를 못 내보내서 이 자리에 둔다.
export const metadata: Metadata = {
    title: '클로버 상점',
    description: '모은 클로버로 바꿀 수 있는 것들.',
    keywords: ['큐리 AI 클로버 상점', '클로버 사용처'],
    openGraph: {
        title: '클로버 상점 | 큐리 AI',
        description: '모은 클로버로 바꿀 수 있는 것들.',
        type: 'website',
        url: 'https://www.curi-ai.com/store',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '클로버 상점 | 큐리 AI' }],
    },
    twitter: { card: 'summary_large_image', title: '클로버 상점 | 큐리 AI', description: '모은 클로버로 바꿀 수 있는 것들.', images: ['/og-image.png'] },
    alternates: { canonical: 'https://www.curi-ai.com/store' },
    robots: { index: true, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    // 대표 지시 2026-09-16 「상점은 잠시 숨겨놓자」
    // 상점이 아직 준비 중이라 잠시 닫는다. 주소를 직접 쳐도 첫 화면으로 보낸다.
    // 다시 열 때는 이 세 줄만 지우면 된다(화면 코드는 그대로 두었다).
    redirect('/mentors')

    return children
}
