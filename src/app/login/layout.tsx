import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: '로그인',
    description: 'Google 계정으로 간편하게 시작하세요. AI가 24시간 함께합니다.',
    openGraph: {
        title: '로그인 | 큐리 AI',
        description: 'Google 계정으로 간편하게 시작하세요. AI가 24시간 함께합니다.',
    },
    // 영어 화면과 짝을 이룬다. 루트(/)는 307 리다이렉트라 hreflang 대상이 될 수 없어
    // 비로그인 방문자가 실제로 도착하는 이 화면을 한국어 쪽 짝으로 쓴다.
    alternates: {
        canonical: '/login',
        languages: {
            'ko-KR': '/login',
            'en-US': '/en',
            'x-default': '/en',
        },
    },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return children
}
