import type { Metadata } from 'next'
import LandingBody from './LandingBody'

// 새 랜딩(대표 지시 0923). 첫 주소(/)는 그대로 /studio — 여긴 /landing 에서만 확인.
export const metadata: Metadata = {
    title: '내 일을 나눠 맡는 AI 봇 팀',
    description: '기획, 홍보, 개발, 조사를 맡은 봇 4명이 내 자료로 초안을 만들고, 밖으로 나가는 일은 내가 허용한 뒤에만 해요.',
    alternates: { canonical: 'https://www.curi-ai.com/landing' },
}

export default function LandingPage() {
    return <LandingBody />
}
