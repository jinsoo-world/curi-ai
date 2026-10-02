'use client'
// 입력창 위 한 줄 = 「🍀 모아 둔 대화 N번 남음 [요금제]」. 클로버 20개 이하면 경고색, 0번이면 안 그린다(클로버 판매 끝, 대표 결정 1002).
// ⛔ 클로버 1개가 몇 원인지(원화 환산)는 절대 안 적는다(대표 확정 0915).
// 잔량 창구는 이미 있는 것(credit 도메인 getCreditBalance)을 그대로 쓴다 — 새 창구를 만들지 않았다.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getCreditBalance } from '@/domains/credit'
import { 클로버듣기, 클로버씀듣기 } from '@/lib/clover-bus'
import { cloverBarView } from '@/domains/os/settings'

export default function CloverBar({ guest }: { guest: boolean }) {
    const pathname = usePathname() || '/os'
    const [balance, setBalance] = useState<number | null>(null)

    useEffect(() => {
        if (guest) return
        let alive = true
        getCreditBalance().then(n => { if (alive) setBalance(n) }).catch(() => { })
        // 대화에서 클로버를 쓰거나 충전하면 새로고침 없이 바로 바뀐다 (대표 0930 「클로버 주는 게 눈에 보이면 좋겠어」)
        const 끄기1 = 클로버듣기(n => setBalance(n))
        const 끄기2 = 클로버씀듣기(n => setBalance(b => (b === null ? b : Math.max(0, b - n))))
        return () => { alive = false; 끄기1(); 끄기2() }
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
