import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: '대화 목록 — 큐리 AI',
    description: 'AI와 나눈 대화를 다시 확인하세요. AI별 대화 히스토리를 한눈에.',
    openGraph: {
        title: '대화 목록 — 큐리 AI',
        description: 'AI와 나눈 대화를 다시 확인하세요.',
    },
}

export default function ChatsLayout({ children }: { children: React.ReactNode }) {
    return children
}
