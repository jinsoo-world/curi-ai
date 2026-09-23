// 손님용 첫 화면 (/os/welcome) = 큐리AI 가 무엇인지 3화면 분량을 한 페이지에.
// 서버 껍데기 = 검색용 metadata 만. 글자는 언어(한국어, 영어, 일본어)에 따라 바뀌므로 몸통은 WelcomeBody(클라이언트).

import type { Metadata } from 'next'
import WelcomeBody from './WelcomeBody'

export const metadata: Metadata = {
    title: { absolute: '큐리AI | 인생 후반전 에이전트 OS' },
    description: '이름 있는 AI 봇 팀이 내 자료로 답하고 초안을 만듭니다. 밖으로 나가는 일은 내가 허용한 뒤에만.',
    openGraph: {
        title: '인생 후반전 에이전트 OS, 큐리AI',
        description: '이름 있는 AI 봇 팀이 내 자료로 답하고 초안을 만듭니다. 밖으로 나가는 일은 내가 허용한 뒤에만.',
        url: 'https://www.curi-ai.com/os/welcome',
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
    robots: { index: true },   // 손님이 처음 밟는 소개 화면이라 검색에 올린다
}

export default function WelcomePage() {
    return <WelcomeBody />
}
