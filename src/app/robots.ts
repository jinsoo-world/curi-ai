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
                    '/creator/',
                    '/chats',
                    '/profile',
                    '/missions',
                    '/store',
                    '/billing/',
                    '/onboarding',
                    '/auth/',
                ],
            },
        ],
        sitemap: 'https://www.curi-ai.com/sitemap.xml',
    }
}
