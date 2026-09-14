import type { Metadata } from 'next'

// 카톡 공유·검색 노출 — 대표 지시 2026-09-15 「카톡 공유 시 OG 이미지 / GEO, SEO」
//
// 화면 파일이 'use client' 라 거기서는 metadata 를 내보낼 수 없다. 그래서 이 자리에 둔다.
// 우리 회원의 90%가 카카오톡을 타고 들어온다(0908 실측). 공유 그림이 없으면 그 길이 죽는다.
export const metadata: Metadata = {
    title: '재취업 프로필 사진 만들기 — 큐리 AI',
    description: '사진 한 장으로 이력서·링크드인에 넣을 프로필 사진을 만듭니다. 얼굴은 그대로, 옷과 배경만 바꿔요. 중장년 재취업 사진 전문.',
    keywords: ['재취업 프로필 사진', '이력서 사진', '증명사진 AI', '링크드인 프로필', '중장년 프로필 사진', 'AI 프로필 사진'],
    openGraph: {
        title: '재취업 프로필 사진 만들기 — 큐리 AI',
        description: '사진 한 장으로 이력서·링크드인에 넣을 프로필 사진을 만듭니다. 얼굴은 그대로, 옷과 배경만 바꿔요. 중장년 재취업 사진 전문.',
        type: 'website',
        url: 'https://www.curi-ai.com/tools/profile-photo',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og/profile-photo.png', width: 1200, height: 630, alt: '재취업 프로필 사진 만들기 — 큐리 AI' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: '재취업 프로필 사진 만들기 — 큐리 AI',
        description: '사진 한 장으로 이력서·링크드인에 넣을 프로필 사진을 만듭니다. 얼굴은 그대로, 옷과 배경만 바꿔요. 중장년 재취업 사진 전문.',
        images: ['/og/profile-photo.png'],
    },
    alternates: { canonical: 'https://www.curi-ai.com/tools/profile-photo' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
