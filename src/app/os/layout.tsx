import type { Metadata, Viewport } from 'next'
import OsShell from '@/components/os/OsShell'

export const metadata: Metadata = {
    title: '내 봇 팀',
    description: '이름 있는 AI 봇 팀이 내 자료로 답하고 초안을 만듭니다. 밖으로 나가는 일은 내가 허용한 뒤에만.',
    robots: { index: false },   // 개인 화면. 검색에 안 올린다
}

// 앱으로 설치해 여는 첫 화면(/os)이라 여기서만 바꾼다.
// themeColor = 다크 바탕과 같은 색(상태바·창 테두리) · viewportFit=cover = 노치·홈 표시줄 뒤까지 그린다(안전 영역은 os.css 가 띄운다)
export const viewport: Viewport = {
    themeColor: '#0B0B0C',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
}

export default function OsLayout({ children }: { children: React.ReactNode }) {
    return <OsShell>{children}</OsShell>
}
