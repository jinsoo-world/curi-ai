// /os/make = OS 안 첫 경험 「내 SNS 주소만 넣으면, 나처럼 말하는 AI가 생겨요」 (대표 확정 10/3 12:32 「OS UI에 다 옮겨놔」)
// 옛 /home 의 검색용 제목·설명을 여기로 옮겼다. /, /home 은 여기로 308.
// OS 뼈대(os/layout)는 검색 막음(index:false)이지만 이 화면만 검색에 올린다.
import type { Metadata } from 'next'
import OsMake from '@/components/os/OsMake'

const DESC = '내 SNS 주소만 넣으면 나처럼 말하는 AI가 생겨요. 무료로 시작하세요.'
export const metadata: Metadata = {
    title: { absolute: '나처럼 말하는 AI 만들기 | 큐리AI' },
    description: DESC,
    openGraph: {
        title: '나처럼 말하는 AI 만들기 | 큐리AI',
        description: DESC,
        type: 'website',
        url: 'https://www.curi-ai.com/os/make',
        siteName: '큐리 AI',
        locale: 'ko_KR',
        images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '큐리AI' }],
    },
    twitter: { card: 'summary_large_image', title: '나처럼 말하는 AI 만들기 | 큐리AI', description: DESC, images: ['/og-image.png'] },
    alternates: { canonical: 'https://www.curi-ai.com/os/make' },
    robots: { index: true, follow: true },
}

export default function OsMakePage() {
    return <OsMake />
}
