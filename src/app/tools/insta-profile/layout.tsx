import type { Metadata } from 'next'

// 카톡 공유·검색 노출 — 대표 지시 2026-09-15 「카톡 공유 시 OG 이미지 / GEO, SEO」
//
// 화면 파일이 'use client' 라 거기서는 metadata 를 내보낼 수 없다. 그래서 이 자리에 둔다.
// 우리 회원의 90%가 카카오톡을 타고 들어온다(0908 실측). 공유 그림이 없으면 그 길이 죽는다.
export const metadata: Metadata = {
    title: '인스타 프로필 사진 만들기 — 큐리 AI',
    description: '동그랗게 잘려도 얼굴이 잘 나오는 인스타그램 프로필 사진을 만듭니다.',
    keywords: ['인스타 프로필 사진', 'SNS 프로필 사진', '카톡 프로필 사진'],
    openGraph: {
        title: '인스타 프로필 사진 만들기 — 큐리 AI',
        description: '동그랗게 잘려도 얼굴이 잘 나오는 인스타그램 프로필 사진을 만듭니다.',
        type: 'website',
        url: 'https://www.curi-ai.com/tools/insta-profile',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og/insta-profile.png', width: 1200, height: 630, alt: '인스타 프로필 사진 만들기 — 큐리 AI' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: '인스타 프로필 사진 만들기 — 큐리 AI',
        description: '동그랗게 잘려도 얼굴이 잘 나오는 인스타그램 프로필 사진을 만듭니다.',
        images: ['/og/insta-profile.png'],
    },
    alternates: { canonical: 'https://www.curi-ai.com/tools/insta-profile' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
