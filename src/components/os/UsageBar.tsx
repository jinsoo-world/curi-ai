'use client'
// 입력창 위 = 작은 원형 게이지(이번 달 사용량 퍼센트) + 「이번 달 남은 N번」(U8). 누르면 사용량 모달(월간, 클로버, 요금제).
// 대표 결정 0928: 한도는 월간 하나. 대화가 끝나면 OsChat 이 USAGE_EVENT 로 새 값을 알려 준다.
// ⚠️ export 이름과 props { guest, refreshKey } 는 OsShell 이 부르므로 그대로 둔다.
import { useCallback, useEffect, useState } from 'react'
import { isUsageLike, USAGE_EVENT, type UsageLike } from '@/domains/os/usage'
import { useLocale } from './LocaleProvider'
import UsageRing from './UsageRing'
import UsageModal from './UsageModal'
import './usage.css'

export default function UsageBar({ guest, refreshKey }: { guest: boolean; refreshKey?: number }) {
    const [u, setU] = useState<UsageLike | null>(null)
    const [open, setOpen] = useState(false)
    const close = useCallback(() => setOpen(false), [])
    const { t } = useLocale()

    useEffect(() => {
        if (guest) return
        let alive = true
        fetch('/api/os/usage', { cache: 'no-store' }).then(r => r.json()).then(d => { if (alive && isUsageLike(d)) setU(d) }).catch(() => { })
        const onUsage = (e: Event) => { const d = (e as CustomEvent).detail; if (isUsageLike(d)) setU(d) }
        window.addEventListener(USAGE_EVENT, onUsage)
        return () => { alive = false; window.removeEventListener(USAGE_EVENT, onUsage) }
    }, [guest, refreshKey])

    if (guest || !u) return null
    return (
        <>
            <UsageRing pct={u.pct} onClick={() => setOpen(true)} caption={t('usage.caption', { n: u.pct })} />
            {open && <UsageModal data={u} onClose={close} />}
        </>
    )
}
