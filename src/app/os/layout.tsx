import type { Metadata } from 'next'
import OsShell from '@/components/os/OsShell'

export const metadata: Metadata = {
    title: '내 봇 팀',
    description: '이름 있는 AI 봇 팀이 내 자료로 답하고 초안을 만듭니다. 밖으로 나가는 일은 내가 허용한 뒤에만.',
    robots: { index: false },   // 개인 화면. 검색에 안 올린다
}

export default function OsLayout({ children }: { children: React.ReactNode }) {
    return <OsShell>{children}</OsShell>
}
