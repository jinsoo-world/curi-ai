import type { Metadata } from 'next'
import LandingBody from './LandingBody'

// 새 랜딩(대표 지시 0923). 첫 주소(/)는 그대로 /studio — 여긴 /landing 에서만 확인.
export const metadata: Metadata = {
    title: '인생 후반전 에이전트 OS',
    description: '이름 있는 AI 봇 팀이 내 자료로 답하고 초안을 만듭니다. 밖으로 나가는 일은 내가 허용한 뒤에만.',
    alternates: { canonical: 'https://www.curi-ai.com/landing' },
    openGraph: {
        title: '인생 후반전 에이전트 OS, 큐리AI',
        description: '이름 있는 AI 봇 팀이 내 자료로 답하고 초안을 만듭니다. 밖으로 나가는 일은 내가 허용한 뒤에만.',
        url: 'https://www.curi-ai.com/landing',
        siteName: '큐리AI',
        locale: 'ko_KR',
        type: 'website',
        images: [{ url: '/og/curi-os.png', width: 1200, height: 630, alt: '큐리AI | 인생 후반전 에이전트 OS' }],
    },
    twitter: {
        card: 'summary_large_image',
        title: '인생 후반전 에이전트 OS, 큐리AI',
        description: '이름 있는 AI 봇 팀이 내 자료로 답하고 초안을 만듭니다. 밖으로 나가는 일은 내가 허용한 뒤에만.',
        images: ['/og/curi-os.png'],
    },
}

export default function LandingPage() {
    return <LandingBody />
}
