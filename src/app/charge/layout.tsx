import type { Metadata } from 'next'
import { PLANS } from '@/domains/os/plan'

// 검색·카톡 공유 — 대표 지적 2026-09-15 「GEO·SEO 이거 페이지별로 다 심었어??」
// 안 심긴 곳이 11 군데였다. 화면 파일이 'use client' 면 거기서 metadata 를 못 내보내서 이 자리에 둔다.
// 가격은 손으로 적지 않고 요금제 표(PLANS)에서 읽는다 (대표 결정 1002 로 가격이 바뀌었을 때 여기만 옛 값이 남았다)
const paid = PLANS.filter(p => p.price > 0).map(p => `월 ${p.price.toLocaleString('ko-KR')}원`).join(' 또는 ')
const DESCRIPTION = `무료로 시작하고, 봇을 더 많이 쓰고 싶을 때 ${paid} 요금제로 올릴 수 있어요.`

export const metadata: Metadata = {
    title: '요금제',
    description: DESCRIPTION,
    keywords: ['큐리AI 가격', '큐리AI 요금제', 'AI 봇 팀'],
    openGraph: {
        title: '요금제 | 큐리AI',
        description: DESCRIPTION,
        type: 'website',
        url: 'https://www.curi-ai.com/charge',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '요금제 | 큐리AI' }],
    },
    twitter: { card: 'summary_large_image', title: '요금제 | 큐리AI', description: DESCRIPTION, images: ['/og-image.png'] },
    alternates: { canonical: 'https://www.curi-ai.com/charge' },
    robots: { index: true, follow: true },
}

export default function Layout({ children }: { children: React.ReactNode }) {
    return children
}
