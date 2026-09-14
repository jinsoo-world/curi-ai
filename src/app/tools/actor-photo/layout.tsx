import type { Metadata } from 'next'

// 카톡 공유·검색 노출 — 대표 지시 2026-09-15 「카톡 공유 시 OG 이미지 / GEO, SEO」
//
// 화면 파일이 'use client' 라 거기서는 metadata 를 내보낼 수 없다. 그래서 이 자리에 둔다.
// 우리 회원의 90%가 카카오톡을 타고 들어온다(0908 실측). 공유 그림이 없으면 그 길이 죽는다.
export const metadata: Metadata = {
    title: '배우 프로필 사진 만들기',
    description: '캐스팅에 내는 배우 프로필 사진을 사진관에서 찍은 것처럼 만듭니다. 실물과 달라 보이지 않게 보정을 덜 합니다.',
    keywords: ['배우 프로필 사진', '캐스팅 프로필', '시니어 모델 프로필', '연기자 프로필 사진'],
    openGraph: {
        title: '배우 프로필 사진 만들기 — 큐리 AI',
        description: '캐스팅에 내는 배우 프로필 사진을 사진관에서 찍은 것처럼 만듭니다. 실물과 달라 보이지 않게 보정을 덜 합니다.',
        type: 'website',
        url: 'https://www.curi-ai.com/tools/actor-photo',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og/actor-photo.png', width: 1200, height: 630, alt: '배우 프로필 사진 만들기 — 큐리 AI' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: '배우 프로필 사진 만들기 — 큐리 AI',
        description: '캐스팅에 내는 배우 프로필 사진을 사진관에서 찍은 것처럼 만듭니다. 실물과 달라 보이지 않게 보정을 덜 합니다.',
        images: ['/og/actor-photo.png'],
    },
    alternates: { canonical: 'https://www.curi-ai.com/tools/actor-photo' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
