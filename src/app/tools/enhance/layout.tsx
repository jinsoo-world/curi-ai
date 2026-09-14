import type { Metadata } from 'next'

// 카톡 공유·검색 노출 — 대표 지시 2026-09-15 「카톡 공유 시 OG 이미지 / GEO, SEO」
//
// 화면 파일이 'use client' 라 거기서는 metadata 를 내보낼 수 없다. 그래서 이 자리에 둔다.
// 우리 회원의 90%가 카카오톡을 타고 들어온다(0908 실측). 공유 그림이 없으면 그 길이 죽는다.
export const metadata: Metadata = {
    title: '사진 화질 개선하기 — 큐리 AI',
    description: '흐릿한 사진, 오래된 사진, 어두운 사진을 살립니다. 같은 사진을 더 좋은 카메라로 찍은 것처럼요.',
    keywords: ['사진 화질 개선', '오래된 사진 복원', '흐린 사진 선명하게', '옛날 사진 복원', '사진 확대'],
    openGraph: {
        title: '사진 화질 개선하기 — 큐리 AI',
        description: '흐릿한 사진, 오래된 사진, 어두운 사진을 살립니다. 같은 사진을 더 좋은 카메라로 찍은 것처럼요.',
        type: 'website',
        url: 'https://www.curi-ai.com/tools/enhance',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og/enhance.png', width: 1200, height: 630, alt: '사진 화질 개선하기 — 큐리 AI' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: '사진 화질 개선하기 — 큐리 AI',
        description: '흐릿한 사진, 오래된 사진, 어두운 사진을 살립니다. 같은 사진을 더 좋은 카메라로 찍은 것처럼요.',
        images: ['/og/enhance.png'],
    },
    alternates: { canonical: 'https://www.curi-ai.com/tools/enhance' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
