'use client'
// 입력창 위 = 작은 원형 게이지(5시간 창 퍼센트). 누르면 사용량 모달(5시간 창, 이번 주, 클로버, 요금제).
// 대표 지시 0923: 「사용한도는 클로드코드처럼 원형으로, 원형 클릭 시 모달로 사용량(클로버)」.
// 옛 한 줄 글자(「사용 한도 12% / 4시간 12분 후 재설정 / ...」)는 모달 안으로 옮겼다. 손님, 시연에선 숨김.
// ⚠️ export 이름과 props { guest, refreshKey } 는 OsChat 이 부르므로 그대로 둔다.
import { useCallback, useEffect, useState } from 'react'
import type { UsageLike } from '@/domains/os/usage'
import UsageRing from './UsageRing'
import UsageModal from './UsageModal'
import './usage.css'

type UsageJson = Partial<UsageLike> & { guest?: boolean; error?: string }

function isUsable(u: UsageJson | null): u is UsageLike {
    return !!u && !u.guest && !u.error && typeof u.pct5h === 'number' && typeof u.pctWeek === 'number'
}

export default function UsageBar({ guest, refreshKey }: { guest: boolean; refreshKey?: number }) {
    const [u, setU] = useState<UsageJson | null>(null)
    const [open, setOpen] = useState(false)
    const close = useCallback(() => setOpen(false), [])

    useEffect(() => {
        if (guest) return
        let alive = true
        fetch('/api/os/usage', { cache: 'no-store' }).then(r => r.json()).then(d => { if (alive) setU(d) }).catch(() => { })
        return () => { alive = false }
    }, [guest, refreshKey])

    if (guest || !isUsable(u)) return null
    return (
        <>
            <UsageRing pct={u.pct5h} onClick={() => setOpen(true)} />
            {open && <UsageModal data={u} onClose={close} />}
        </>
    )
}
