'use client'
// 사용량 모달. 원형 게이지를 누르면 뜬다. ESC, 배경 클릭, 닫기 단추로 닫힌다. 글자는 사전(i18n)에서, 숫자 글은 usageDetailL.
// 대표 결정 0928: 한도는 월간 하나. 첫 줄은 남은 횟수(U8). 요금제 이름은 서버가 준 실제 요금제(P5).
// 클로버 잔액은 CloverBar 가 이미 쓰는 창구(credit 도메인 getCreditBalance)를 그대로 쓴다.
import { useEffect, useRef, useState } from 'react'
import CloverIcon from '@/components/ui/CloverIcon'
import Link from 'next/link'
import { getCreditBalance } from '@/domains/credit'
import { usageTone, type UsageLike } from '@/domains/os/usage'
import { cloverChats } from '@/domains/os/usage-config'
import { planNameL, usageDetailL } from '@/domains/os/i18n'
import { useLocale } from './LocaleProvider'
import { useIosApp } from '@/hooks/useIosApp'
import { RingSvg } from './UsageRing'

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function UsageModal({ data, onClose }: { data: UsageLike; onClose: () => void }) {
    const sheetRef = useRef<HTMLDivElement>(null)
    const [clover, setClover] = useState<number | null>(null)
    const [now] = useState(() => new Date())
    const { t, locale } = useLocale()
    const iosApp = useIosApp()   // 아이폰 앱 안에서는 요금제 보기 링크를 숨긴다(앱스토어 3.1.1)
    const d = usageDetailL(locale, data, now)

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
                    <h3 id="os-usage-title">{t('usage.title')}</h3>
                    <button type="button" className="os-usage-x" onClick={onClose} aria-label={t('usage.close')}>✕</button>
                </div>

                <p className="os-usage-remaining">{d.remainingText}</p>
                {d.blockedText && <p className="os-usage-blocked" role="alert">{d.blockedText}</p>}

                <section className="os-usage-sec os-usage-5h" aria-label={t('usage.week')}>
                    <RingSvg pct={data.pct} size={112} stroke={9} />
                    <div className="os-usage-5h-text">
                        <div className="os-usage-label">{t('usage.week')}</div>
                        <b>{d.pctText}</b>
                        <div className="os-usage-sub">{d.resetText}</div>
                    </div>
                </section>

                {/* 클로버 판매 끝(대표 결정 1002): 클로버는 「모아 둔 대화 N번」으로 보이고, 0번이면 이 칸을 안 그린다 */}
                {cloverChats(clover) > 0 && (
                    <section className="os-usage-sec" aria-label={t('clover.label')}>
                        <div className="os-usage-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><CloverIcon size={16} /><span>{t('clover.label')}</span></div>
                        <b>{t('clover.balance')}</b>
                        <div className="os-usage-sub">{t('clover.sub')}</div>
                    </section>
                )}

                <section className="os-usage-sec os-usage-plan" aria-label={t('plan.label')}>
                    <span>{t('plan.current')}: <b>{planNameL(locale, data.plan)}</b></span>
                    {iosApp === false && <Link href="/os/charge" className="os-usage-plan-link">{t('usage.planView')}</Link>}
                </section>

                <div className="os-sheet-foot" style={{ justifyContent: 'flex-end' }}>
                    <button type="button" className="os-btn" onClick={onClose}>{t('usage.close')}</button>
                </div>
            </div>
        </div>
    )
}
