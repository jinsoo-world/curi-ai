import type { Metadata } from 'next'

// 검색·카톡 공유 (대표 확정 0915 — 서비스 여섯 개 체제)
export const metadata: Metadata = {
    title: '증명사진 만들기',
    description: '여권·이력서·주민등록에 내는 규격 증명사진을 사진 한 장으로 만듭니다. 정면·바른 자세·그림자 없는 배경까지 규격대로, 표정은 굳지 않게.',
    keywords: ['증명사진 만들기', '여권사진', 'AI 증명사진', '반명함 사진', '이력서 사진', '증명사진 배경 바꾸기'],
    openGraph: {
        title: '증명사진 만들기 — 큐리 AI',
        description: '여권·이력서·주민등록에 내는 규격 증명사진을 사진 한 장으로 만듭니다. 정면·바른 자세·그림자 없는 배경까지 규격대로, 표정은 굳지 않게.',
        type: 'website',
        url: 'https://www.curi-ai.com/tools/id-photo',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og/profile-photo.png', width: 1200, height: 630, alt: '증명사진 만들기 — 큐리 AI' }],
    },
    twitter: { card: 'summary_large_image', title: '증명사진 만들기 — 큐리 AI', description: '여권·이력서·주민등록에 내는 규격 증명사진을 사진 한 장으로 만듭니다. 정면·바른 자세·그림자 없는 배경까지 규격대로, 표정은 굳지 않게.', images: ['/og/profile-photo.png'] },
    alternates: { canonical: 'https://www.curi-ai.com/tools/id-photo' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
