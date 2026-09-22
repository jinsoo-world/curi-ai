import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: '취소/환불 정책',
    description: '큐리 AI 클로버 구매의 취소와 환불 기준입니다.',
    keywords: ['환불', '취소', '청약철회', '클로버'],
    openGraph: {
        title: '취소/환불 정책 | 큐리 AI',
        description: '큐리 AI 클로버 구매의 취소와 환불 기준입니다.',
        type: 'website',
        url: 'https://www.curi-ai.com/refund',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '취소/환불 정책 | 큐리 AI' }],
    },
    twitter: { card: 'summary_large_image', title: '취소/환불 정책 | 큐리 AI', description: '큐리 AI 클로버 구매의 취소와 환불 기준입니다.', images: ['/og-image.png'] },
    alternates: { canonical: 'https://www.curi-ai.com/refund' },
    robots: { index: true, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
