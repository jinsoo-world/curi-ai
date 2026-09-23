'use client'
// 입력창 위 한 줄 = 「🍀 클로버 N개 남음 [충전]」. 20개 이하면 경고색.
// ⛔ 클로버 1개가 몇 원인지(원화 환산)는 절대 안 적는다(대표 확정 0915).
// 잔량 창구는 이미 있는 것(credit 도메인 getCreditBalance)을 그대로 쓴다 — 새 창구를 만들지 않았다.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getCreditBalance } from '@/domains/credit'
import { cloverBarView } from '@/domains/os/settings'

export default function CloverBar({ guest }: { guest: boolean }) {
    const pathname = usePathname() || '/os'
    const [balance, setBalance] = useState<number | null>(null)

    useEffect(() => {
        if (guest) return
        let alive = true
        getCreditBalance().then(n => { if (alive) setBalance(n) }).catch(() => { })
        return () => { alive = false }
    }, [guest])

    const view = cloverBarView(balance, guest, pathname)
    if (!view) return null

    return (
        <div className="os-clover-bar" style={view.warn ? { color: 'var(--os-경고)' } : undefined}>
            <span aria-hidden>🍀</span>
            <span>{view.text}</span>
            <Link href={view.href} className="os-clover-charge">{view.action}</Link>
        </div>
    )
}
