'use client'
// 대화 안 한도 카드 (U9). 봇 말풍선 아래에 붙는다. 단추 하나로 /os/charge.
// warn = 이번 달 한도의 알림 퍼센트(usage-config.ts USAGE_WARN_PCT) 이상, limit = 한도를 다 씀.
// 답이 다 만들어진 뒤에 붙기만 하고 답을 가리거나 막지 않는다.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { USAGE_COPY, fillCopy } from '@/domains/os/usage-config'
import { useIosApp } from '@/hooks/useIosApp'
import './usage.css'

export default function UsageLimitCard({ kind, pct }: { kind: 'warn' | 'limit'; pct: number }) {
    const pathname = usePathname() || '/os'
    const iosApp = useIosApp()   // 아이폰 앱 안에서는 요금제 보기 단추를 숨긴다(앱스토어 3.1.1)
    const text = kind === 'limit' ? USAGE_COPY.limitCard : fillCopy(USAGE_COPY.warnCard, pct)
    if (!text) return null
    return (
        <div className={`os-usage-card ${kind}`} role={kind === 'limit' ? 'alert' : 'status'}>
            <span className="os-usage-card-text">{text}</span>
            {USAGE_COPY.cardButton && iosApp === false && (
                <Link href={`/os/charge?from=${encodeURIComponent(pathname)}`} className="os-usage-card-btn">{USAGE_COPY.cardButton}</Link>
            )}
        </div>
    )
}
