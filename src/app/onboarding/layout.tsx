import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: '프로필 설정 — 큐리 AI',
    description: '관심사를 설정하고, 나에게 맞는 AI와 대화를 시작하세요.',
    openGraph: {
        title: '프로필 설정 — 큐리 AI',
        description: '관심사를 설정하고, 나에게 맞는 AI와 대화를 시작하세요.',
    },
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
    return children
}
