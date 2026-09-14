import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 3600 // 1시간마다 재생성

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://www.curi-ai.com'

    // 정적 페이지
    const staticPages: MetadataRoute.Sitemap = [
        {
            url: baseUrl,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 1.0,
        },
        {
            url: `${baseUrl}/mentors`,
            lastModified: new Date(),
            changeFrequency: 'daily',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/en`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/login`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.5,
        },
        // 만드는 도구 — 대표 지시 0915 「GEO, SEO」
        // 검색으로 사람이 들어오는 문은 「무엇을 해주는 곳인가」가 적힌 화면이다.
        ...['profile-photo', 'actor-photo', 'enhance', 'thumbnail', 'insta-profile'].map((t) => ({
            url: `${baseUrl}/tools/${t}`,
            lastModified: new Date(),
            changeFrequency: 'weekly' as const,
            priority: 0.9,
        })),
        {
            url: `${baseUrl}/studio`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/pricing`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.7,
        },
        {
            url: `${baseUrl}/terms`,
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
        {
            url: `${baseUrl}/privacy`,
            lastModified: new Date(),
            changeFrequency: 'yearly',
            priority: 0.3,
        },
    ]

    // 동적 페이지: 공개된 멘토 프로필 (커스텀 핸들)
    let mentorPages: MetadataRoute.Sitemap = []
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        )
        const { data: mentors } = await supabase
            .from('mentors')
            .select('id, handle, updated_at')
            .eq('is_active', true)

        if (mentors) {
            // 코치 소개 화면은 handle 이 없어도 id 로 열린다. 전에는 handle 있는 것만 넣어서
            // 대부분의 코치가 검색에 한 번도 안 나왔다(0915 확인).
            mentorPages = mentors.flatMap((m) => {
                const 날짜 = m.updated_at ? new Date(m.updated_at) : new Date()
                const 줄: MetadataRoute.Sitemap = [{
                    url: `${baseUrl}/coach/${m.id}`,
                    lastModified: 날짜,
                    changeFrequency: 'weekly' as const,
                    priority: 0.8,
                }]
                if (m.handle) {
                    줄.push({
                        url: `${baseUrl}/${m.handle}`,
                        lastModified: 날짜,
                        changeFrequency: 'weekly' as const,
                        priority: 0.8,
                    })
                }
                return 줄
            })
        }
    } catch (err) {
        console.error('[Sitemap] Error fetching mentors:', err)
    }

    return [...staticPages, ...mentorPages]
}
