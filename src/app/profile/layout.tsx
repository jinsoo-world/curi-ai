import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: '마이페이지 — 큐리 AI',
    description: '프로필을 관리하고, 관심사를 업데이트하세요.',
    openGraph: {
        title: '마이페이지 — 큐리 AI',
        description: '프로필을 관리하고, 관심사를 업데이트하세요.',
    },
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
    return children
}
