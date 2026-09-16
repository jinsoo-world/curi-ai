import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: '보관함',
    description: '만든 사진을 48시간 동안 보관합니다. 여기서 다시 내려받을 수 있어요.',
    robots: { index: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
