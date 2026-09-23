import type { Metadata, Viewport } from 'next'
import OsShell from '@/components/os/OsShell'
import LocaleProvider from '@/components/os/LocaleProvider'
import '@/components/os/theme.css'

export const metadata: Metadata = {
    title: { absolute: '큐리AI' },   // 창 제목은 「큐리AI」 하나만 (대표 0923)
    description: '이름 있는 AI 봇 팀이 내 자료로 답하고 초안을 만듭니다. 밖으로 나가는 일은 내가 허용한 뒤에만.',
    // 카톡/아이메시지/슬랙 링크 미리보기용. 검색은 막되(index:false) OG 는 심는다.
    openGraph: {
        title: '인생 후반전 에이전트 OS, 큐리AI',
        description: '이름 있는 AI 봇 팀이 내 자료로 답하고 초안을 만듭니다. 밖으로 나가는 일은 내가 허용한 뒤에만.',
        url: 'https://www.curi-ai.com/os',
        siteName: '큐리AI',
        locale: 'ko_KR',
        type: 'website',
        images: [
            {
                url: '/og/curi-os.png',
                width: 1200,
                height: 630,
                alt: '큐리AI | 인생 후반전 에이전트 OS',
            },
        ],
    },
    twitter: {
        card: 'summary_large_image',
        title: '인생 후반전 에이전트 OS, 큐리AI',
        description: '이름 있는 AI 봇 팀이 내 자료로 답하고 초안을 만듭니다. 밖으로 나가는 일은 내가 허용한 뒤에만.',
        images: ['/og/curi-os.png'],
    },
    robots: { index: false },   // 개인 화면. 검색에 안 올린다
}

// 앱으로 설치해 여는 첫 화면(/os)이라 여기서만 바꾼다.
// themeColor = 다크 바탕과 같은 색(상태바, 창 테두리) / viewportFit=cover = 노치, 홈 표시줄 뒤까지 그린다(안전 영역은 os.css 가 띄운다)
// 라이트 모드로 바꾸면 LocaleProvider 가 meta theme-color 를 흰색으로 고쳐 준다.
export const viewport: Viewport = {
    themeColor: '#0B0B0C',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
}

/**
 * 첫 그림 전에 화면 모드를 붙이는 한 줄 (깜빡임 방지).
 * 저장 열쇠 `os-theme`(light|dark, 없으면 시스템) 규칙은 domains/os/local-prefs.ts 와 같아야 한다.
 * html 이 아니라 바로 위 감싸는 칸(data-os-root)에 붙인다 = 뿌리 레이아웃을 안 건드리고, hydration 경고도 그 칸 하나에서만 끈다.
 */
const THEME_BOOT = `(function(){try{var c=localStorage.getItem('os-theme');var d=matchMedia('(prefers-color-scheme: dark)').matches;var t=(c==='light'||c==='dark')?c:(d?'dark':'light');var r=document.currentScript.parentElement;r.setAttribute('data-theme',t);if(t==='light'){var m=document.querySelector('meta[name="theme-color"]');if(m)m.content='#FFFFFF'}}catch(e){}})()`

export default function OsLayout({ children }: { children: React.ReactNode }) {
    return (
        <div data-os-root suppressHydrationWarning style={{ display: 'contents' }}>
            <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
            <LocaleProvider>
                <OsShell>{children}</OsShell>
            </LocaleProvider>
        </div>
    )
}
