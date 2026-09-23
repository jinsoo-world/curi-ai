'use client'
import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import OsChat from '@/components/os/OsChat'

function ChatInner() {
    const params = useParams()
    const sp = useSearchParams()
    const botId = String(params.botId ?? '')
    if (!botId) return null
    // ?new=시각 = 「대화 새로 시작」(우클릭 메뉴). 열쇠(key)가 바뀌면 대화 화면이 새로 그려져 빈 대화로 시작한다
    return <OsChat key={`${botId}:${sp.get('new') ?? ''}`} mentorId={botId} />
}

export default function OsChatPage() {
    return <Suspense fallback={null}><ChatInner /></Suspense>
}
