import type { Metadata } from 'next'

// 검색에 걸리지 않게 막는다. 심사관만 주소로 들어오는 화면이다.
export const metadata: Metadata = {
    title: '심사용 로그인',
    robots: { index: false, follow: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
