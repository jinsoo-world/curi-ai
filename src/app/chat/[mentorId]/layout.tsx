import type { Metadata } from 'next'
import { botPageMetadata } from '@/domains/share/botMetadata'

interface Props {
    params: Promise<{ mentorId: string }>
    children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { mentorId } = await params
    return botPageMetadata(mentorId, `/chat/${mentorId}`)
}

export default function ChatLayout({ children }: Props) {
    return children
}
