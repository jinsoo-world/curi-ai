import type { Metadata } from 'next'

// 카톡 공유·검색 노출 — 대표 지시 2026-09-15 「카톡 공유 시 OG 이미지 / GEO, SEO」
//
// 화면 파일이 'use client' 라 거기서는 metadata 를 내보낼 수 없다. 그래서 이 자리에 둔다.
// 우리 회원의 90%가 카카오톡을 타고 들어온다(0908 실측). 공유 그림이 없으면 그 길이 죽는다.
export const metadata: Metadata = {
    title: '썸네일 만들기',
    description: '유튜브·강의·멤버십·전자책 표지를 만듭니다. 제목은 또렷하게 얹어드려요.',
    keywords: ['유튜브 썸네일 만들기', '강의 썸네일', '전자책 표지', '썸네일 제작', '무료 썸네일'],
    openGraph: {
        title: '썸네일 만들기 — 큐리 AI',
        description: '유튜브·강의·멤버십·전자책 표지를 만듭니다. 제목은 또렷하게 얹어드려요.',
        type: 'website',
        url: 'https://www.curi-ai.com/tools/thumbnail',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og/thumbnail.png', width: 1200, height: 630, alt: '썸네일 만들기 — 큐리 AI' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: '썸네일 만들기 — 큐리 AI',
        description: '유튜브·강의·멤버십·전자책 표지를 만듭니다. 제목은 또렷하게 얹어드려요.',
        images: ['/og/thumbnail.png'],
    },
    alternates: { canonical: 'https://www.curi-ai.com/tools/thumbnail' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
