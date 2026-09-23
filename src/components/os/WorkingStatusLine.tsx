'use client'
// 답 기다리는 동안: 작은 아바타 + 회전 상태 문구 (그록식). 오로라는 「답장 준비 중」.

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
            className={`os-working-row${status.aurora ? ' os-working-row--aurora' : ''}${className ? ` ${className}` : ''}`}
            aria-live="polite"
            aria-atomic="true"
            role="status"
        >
            {avatar}
            <span className={status.aurora ? 'os-aurora-text' : 'os-working-text'}>{status.text}</span>
        </div>
    )
}
