import type { Metadata } from 'next'

// 고객센터 (2026-10-02). 앱스토어 심사 「지원 주소」 = https://www.curi-ai.com/support
export const metadata: Metadata = {
    title: '고객센터',
    description: '큐리 AI 고객센터입니다. 자주 묻는 질문을 보고, 궁금한 점은 문의를 남겨 주세요.',
    openGraph: {
        title: '고객센터 | 큐리 AI',
        description: '큐리 AI 고객센터입니다. 자주 묻는 질문을 보고, 궁금한 점은 문의를 남겨 주세요.',
        type: 'website',
        url: 'https://www.curi-ai.com/support',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '고객센터 | 큐리 AI' }],
    },
    alternates: { canonical: 'https://www.curi-ai.com/support' },
    robots: { index: true, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
