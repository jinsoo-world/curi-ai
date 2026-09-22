import type { Metadata } from 'next'

// 검색·카톡 공유 — 대표 지적 2026-09-15 「GEO·SEO 이거 페이지별로 다 심었어??」
// 안 심긴 곳이 11 군데였다. 화면 파일이 'use client' 면 거기서 metadata 를 못 내보내서 이 자리에 둔다.
export const metadata: Metadata = {
    title: '만들기',
    description: '사진 한 장으로 프로필 사진·전자책까지. 중장년을 위한 AI 도구 모음입니다.',
    keywords: ['AI 도구', '프로필 사진 만들기', '중장년 AI', 'AI 사진 편집'],
    openGraph: {
        title: '오늘 뭘 만들까요 — 큐리 AI',
        description: '사진 한 장으로 프로필 사진·전자책까지. 중장년을 위한 AI 도구 모음입니다.',
        type: 'website',
        url: 'https://www.curi-ai.com/studio',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og/profile-photo.png', width: 1200, height: 630, alt: '오늘 뭘 만들까요 — 큐리 AI' }],
    },
    twitter: { card: 'summary_large_image', title: '오늘 뭘 만들까요 — 큐리 AI', description: '사진 한 장으로 프로필 사진·전자책까지. 중장년을 위한 AI 도구 모음입니다.', images: ['/og/profile-photo.png'] },
    alternates: { canonical: 'https://www.curi-ai.com/studio' },
    robots: { index: true, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
