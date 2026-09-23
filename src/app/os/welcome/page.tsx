// 손님용 첫 화면 (/os/welcome) = 큐리AI 가 무엇인지 3화면 분량을 한 페이지에.
// 서버 껍데기 = 검색용 metadata 만. 글자는 언어(한국어, 영어, 일본어)에 따라 바뀌므로 몸통은 WelcomeBody(클라이언트).

import type { Metadata } from 'next'
import WelcomeBody from './WelcomeBody'

export const metadata: Metadata = {
    title: '큐리AI, 내 봇 팀',
    description: '이름 있는 AI 팀원(봇)이 내 자료로 답하고 초안을 만듭니다. 밖으로 나가는 일은 내가 허용한 뒤에만.',
    robots: { index: true },   // 손님이 처음 밟는 소개 화면이라 검색에 올린다
}

export default function WelcomePage() {
    return <WelcomeBody />
}
