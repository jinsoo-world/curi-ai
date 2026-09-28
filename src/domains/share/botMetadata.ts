import type { Metadata } from 'next'
import { getPublicMentorById } from '@/domains/mentor'
import { botShareMeta, type ShareBot } from './botMeta'

/** 공유 링크(/chat/{봇}) 카톡·SNS 미리보기. 공개 봇만 이름·한 줄·얼굴, 나머지는 기본 카드 */
export async function botPageMetadata(mentorId: string, path: string): Promise<Metadata> {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.curi-ai.com'
    let bot: ShareBot | null = null
    try { bot = (await getPublicMentorById(mentorId)) as ShareBot | null } catch { bot = null }
    const m = botShareMeta(bot, baseUrl)
    const images = m.image ? [{ url: m.image, width: 1200, height: 630, alt: bot?.name ?? '큐리AI' }] : [{ url: `${baseUrl}/logo.png` }]
    return {
        title: m.title,
        description: m.description,
        robots: { index: false, follow: false },
        openGraph: { title: m.title, description: m.description, type: 'website', url: `${baseUrl}${path}`, images, siteName: '큐리AI', locale: 'ko_KR' },
        twitter: { card: m.image ? 'summary_large_image' : 'summary', title: m.title, description: m.description, images: images.map(i => i.url) },
    }
}

