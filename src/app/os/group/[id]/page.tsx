'use client'
import { useParams } from 'next/navigation'
import OsGroupChat from '@/components/os/OsGroupChat'

export default function OsGroupPage() {
    const params = useParams()
    const id = String(params.id ?? '')
    if (!id) return null
    return <OsGroupChat key={id} channelId={id} />
}
