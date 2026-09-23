'use client'
// 사용량 모달. 원형 게이지를 누르면 뜬다. ESC, 배경 클릭, 닫기 단추로 닫힌다.
// 대표 확정 0923: 내 봇은 무료(클로버 0). 요금은 구독 2단계 = 무료(기본) / 월 29,000원 / 월 99,000원.
// 클로버 잔액은 CloverBar 가 이미 쓰는 창구(credit 도메인 getCreditBalance)를 그대로 쓴다.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getCreditBalance } from '@/domains/credit'
import { usageDetail, usageTone, withComma, type UsageLike } from '@/domains/os/usage'
import { RingSvg } from './UsageRing'

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function UsageModal({ data, onClose }: { data: UsageLike; onClose: () => void }) {
    const sheetRef = useRef<HTMLDivElement>(null)
    const [clover, setClover] = useState<number | null>(null)
    const [now] = useState(() => new Date())
    const d = usageDetail(data, now)

    useEffect(() => {
        let alive = true
        getCreditBalance().then(n => { if (alive) setClover(n) }).catch(() => { })
        return () => { alive = false }
    }, [])

    // 열리면 첫 단추로 포커스, 닫히면 열었던 곳으로 되돌린다. Tab 은 모달 안에서만 돈다.
    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null
        const first = sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE)
        first?.focus()
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
            if (e.key !== 'Tab' || !sheetRef.current) return
            const items = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
            if (items.length === 0) return
            const head = items[0], tail = items[items.length - 1]
            if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus() }
            else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus() }
        }
        document.addEventListener('keydown', onKey)
        return () => { document.removeEventListener('keydown', onKey); opener?.focus?.() }
    }, [onClose])

    return (
        <div className="os-sheet-back" data-theme="os" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="os-usage-title">
            <div className="os-sheet os-usage-modal" ref={sheetRef} onClick={e => e.stopPropagation()}>
                <div className="os-usage-head">
                    <h3 id="os-usage-title">사용량</h3>
                    <button type="button" className="os-usage-x" onClick={onClose} aria-label="닫기">✕</button>
                </div>

                {d.blockedText && <p className="os-usage-blocked" role="alert">{d.blockedText}</p>}

                <section className="os-usage-sec os-usage-5h" aria-label="5시간 창">
                    <RingSvg pct={data.pct5h} size={112} stroke={9} />
                    <div className="os-usage-5h-text">
                        <div className="os-usage-label">5시간 창</div>
                        <b>{d.fiveHourText}</b>
                        <div className="os-usage-sub">{d.fiveHourReset}</div>
                    </div>
                </section>

                <section className="os-usage-sec" aria-label="이번 주">
                    <div className="os-usage-label">이번 주</div>
                    <div className="os-usage-bar-track" data-tone={usageTone(data.pctWeek)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.pctWeek} aria-label="이번 주 사용량">
                        <span style={{ width: `${Math.min(100, data.pctWeek)}%` }} />
                    </div>
                    <b>{d.weekText}</b>
                    <div className="os-usage-sub">{d.weekReset}</div>
                </section>

                <section className="os-usage-sec" aria-label="클로버">
                    <div className="os-usage-label">클로버</div>
                    <b>{clover === null ? '지금 가진 클로버를 세고 있어요' : `지금 가진 클로버 ${withComma(clover)}개`}</b>
                    <div className="os-usage-sub">내 팀 봇과의 대화는 클로버를 쓰지 않아요. 봇 마켓의 다른 리더 봇과 대화할 때만 써요.</div>
                </section>

                <section className="os-usage-sec os-usage-plan" aria-label="요금제">
                    <span>지금 요금제: <b>무료(기본)</b></span>
                    <Link href="/os/charge" className="os-usage-plan-link">요금제 보기</Link>
                </section>

                <div className="os-sheet-foot" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="os-btn" onClick={onClose}>닫기</button>
                </div>
            </div>
        </div>
    )
}
