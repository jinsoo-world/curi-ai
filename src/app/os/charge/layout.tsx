import type { Metadata } from 'next'

// 화면 파일이 'use client' 라서 탭 제목은 여기서 준다. 개인 화면이라 검색에는 안 올린다(/os/layout 과 같다)
export const metadata: Metadata = {
    title: '클로버 충전',
    robots: { index: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
