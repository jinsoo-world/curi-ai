'use client'
// 답 기다리는 동안: 작은 아바타(고정) + 오로라 상태 문구 (그록식). 얼굴은 돌리지 않는다.

import { useEffect, useState, type ReactNode } from 'react'
import { pickWorkingStatus, type WorkingStatusOpts } from '@/domains/os/working-status'

interface Props extends WorkingStatusOpts {
    avatar?: ReactNode
    className?: string
}

export default function WorkingStatusLine({ avatar, botName, hasFiles, className }: Props) {
    const [elapsed, setElapsed] = useState(0)
    useEffect(() => {
        const t0 = Date.now()
        const id = window.setInterval(() => setElapsed(Date.now() - t0), 400)
        return () => window.clearInterval(id)
    }, [])
    const status = pickWorkingStatus(elapsed, { botName, hasFiles })
    return (
        <div
            className={`os-working-row os-working-row--aurora${className ? ` ${className}` : ''}`}
            aria-live="polite"
            aria-atomic="true"
            role="status"
        >
            {avatar ? <span className="os-working-avatar">{avatar}</span> : null}
            <span className="os-aurora-text">{status.text}</span>
        </div>
    )
}
