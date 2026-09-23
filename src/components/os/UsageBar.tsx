'use client'
// 입력창 위 한 줄 = 「사용 한도 12% / 4시간 12분 후 재설정 / 주간 3% / (월) 0시 초기화」
// 대표 확정 0923: 내 봇은 클로버 0. 클로버 대신 이 한 줄만 보인다. 손님, 시연에선 숨김.
import { useEffect, useState } from 'react'

interface UsageJson { line?: string; pct5h?: number; pctWeek?: number; blocked?: boolean; guest?: boolean }

export default function UsageBar({ guest, refreshKey }: { guest: boolean; refreshKey?: number }) {
    const [u, setU] = useState<UsageJson | null>(null)
    useEffect(() => {
        if (guest) return
        let alive = true
        fetch('/api/os/usage', { cache: 'no-store' }).then(r => r.json()).then(d => { if (alive) setU(d) }).catch(() => { })
        return () => { alive = false }
    }, [guest, refreshKey])
    if (guest || !u?.line) return null
    const warn = (u.pct5h ?? 0) >= 80 || (u.pctWeek ?? 0) >= 80
    return (
        <div className="os-usage-bar" data-warn={warn || undefined} aria-live="polite">
            <span aria-hidden>📊</span>
            <span>{u.line}</span>
        </div>
    )
}
