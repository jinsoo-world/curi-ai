import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/api/',
                    '/chat/',
                    // 「나를 닮은 AI 만들기」는 우리 서비스 여섯 개 중 하나다.
                    // /creator/ 를 통째로 막으면 그 문이 검색에서 사라진다. 뒷방만 막는다.
                    '/creator/edit/',
                    '/creator/manage',
                    '/chats',
                    '/profile',
                    '/missions',
                    '/store',
                    '/billing/',
                    '/onboarding',
                    '/auth/',
                    '/photos',
                ],
            },
        ],
        sitemap: 'https://www.curi-ai.com/sitemap.xml',
    }
}
