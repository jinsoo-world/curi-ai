import type { Metadata } from 'next'

// 2026-09-15 내림 — 행정안전부가 신분증에 AI 사진을 못 쓰게 했다.
// 검색에서도 뺀다. 들어온 분께는 사정을 말하고 다른 도구로 안내한다.
export const metadata: Metadata = {
    title: '증명사진 안내',
    description: '신분증에는 AI로 만든 사진을 쓸 수 없습니다. 강사 프로필·배우 프로필·화질 개선은 그대로 이용하실 수 있어요.',
    robots: { index: false, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
