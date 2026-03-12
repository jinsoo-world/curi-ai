import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getMentorById, MENTOR_IMAGES } from '@/domains/mentor'

interface Props {
    params: Promise<{ mentorId: string }>
    children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { mentorId } = await params

    try {
        const supabase = await createClient()
        const mentor = await getMentorById(supabase, mentorId)

        if (!mentor) {
            return { title: '큐리 AI — 대화' }
        }

        const mentorImage = mentor.avatar_url || MENTOR_IMAGES[mentor.name]
        // 절대 URL로 변환 (OG 이미지는 절대 경로 필요)
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.curi-ai.com'
        const ogImage = mentorImage?.startsWith('http')
            ? mentorImage
            : `${baseUrl}${mentorImage || '/logo.png'}`

        const title = `${mentor.name} AI ㅣ ${mentor.title}`
        const description = '궁금한 것을 언제든 물어보세요.'

        return {
            title,
            description,
            openGraph: {
                title,
                description,
                type: 'website',
                url: `${baseUrl}/chat/${mentorId}`,
                images: [
                    {
                        url: ogImage,
                        width: 600,
                        height: 600,
                        alt: `${mentor.name} AI`,
                    },
                ],
                siteName: '큐리 AI',
            },
            twitter: {
                card: 'summary',
                title,
                description,
                images: [ogImage],
            },
        }
    } catch {
        return { title: '큐리 AI — 대화' }
    }
}

export default function ChatLayout({ children }: Props) {
    return children
}
