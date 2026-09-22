'use client'
import { useParams } from 'next/navigation'
import OsChat from '@/components/os/OsChat'

export default function OsChatPage() {
    const params = useParams()
    const botId = String(params.botId ?? '')
    if (!botId) return null
    return <OsChat key={botId} mentorId={botId} />
}
