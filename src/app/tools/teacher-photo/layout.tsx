import type { Metadata } from 'next'

// 검색·카톡 공유 (대표 확정 0915 — 서비스 여섯 개 체제)
export const metadata: Metadata = {
    title: '강사 프로필 만들기 — 큐리 AI',
    description: '강의 소개에 거는 강사 프로필 사진을 만듭니다. 믿음직하면서도 말 걸기 편해 보이게.',
    keywords: ['강사 프로필 사진', '강의 프로필', '전문가 프로필 사진', 'SNS 프로필 사진', '중장년 프로필 사진'],
    openGraph: {
        title: '강사 프로필 만들기 — 큐리 AI',
        description: '강의 소개에 거는 강사 프로필 사진을 만듭니다. 믿음직하면서도 말 걸기 편해 보이게.',
        type: 'website',
        url: 'https://www.curi-ai.com/tools/teacher-photo',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og/profile-photo.png', width: 1200, height: 630, alt: '강사 프로필 만들기 — 큐리 AI' }],
    },
    twitter: { card: 'summary_large_image', title: '강사 프로필 만들기 — 큐리 AI', description: '강의 소개에 거는 강사 프로필 사진을 만듭니다. 믿음직하면서도 말 걸기 편해 보이게.', images: ['/og/profile-photo.png'] },
    alternates: { canonical: 'https://www.curi-ai.com/tools/teacher-photo' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
