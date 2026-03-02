import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: '로그인 — 큐리 AI',
    description: 'Google 계정으로 간편하게 시작하세요. AI 멘토가 24시간 함께합니다.',
    openGraph: {
        title: '로그인 — 큐리 AI',
        description: 'Google 계정으로 간편하게 시작하세요. AI 멘토가 24시간 함께합니다.',
    },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return children
}
