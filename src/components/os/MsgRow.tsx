'use client'
// 말풍선 줄 + 오른쪽 시각. 메시지 목록을 왼쪽으로 끌면(터치/마우스/트랙패드) 시각이 드러나고
// 손을 떼면 고무줄처럼 돌아온다 (Grok 채팅과 같은 느낌).

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { formatMessageTime } from '@/domains/os/message-time'

/** 시각 칸 폭(px). CSS --os-time-w 와 맞춰 둔다 */
export const MSG_TIME_W = 72
const AXIS_LOCK = 8
const WHEEL_IDLE_MS = 140

type Axis = 'h' | 'v' | null

/**
 * `.os-messages` 에 붙인다. ref + CSS 변수(--os-reveal) + revealing 클래스.
 * 세로 스크롤·텍스트 선택은 가로로 확실히 끌 때만 가로로 잠근다.
 */
export function useRevealTimestamps() {
    const ref = useRef<HTMLDivElement>(null)
    const [reveal, setReveal] = useState(0)
    const [active, setActive] = useState(false)
    const revealRef = useRef(0)
    const axisRef = useRef<Axis>(null)
    const startX = useRef(0)
    const startY = useRef(0)
    const startReveal = useRef(0)
    const pointerId = useRef<number | null>(null)
    const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const rafBack = useRef<number | null>(null)

    const setRevealBoth = useCallback((v: number) => {
        const next = Math.max(0, Math.min(MSG_TIME_W, v))
        revealRef.current = next
        setReveal(next)
    }, [])

    const snapBack = useCallback(() => {
        if (rafBack.current != null) cancelAnimationFrame(rafBack.current)
        setActive(false)
        const tick = () => {
            const cur = revealRef.current
            if (cur <= 0.5) {
                setRevealBoth(0)
                rafBack.current = null
                return
            }
            setRevealBoth(cur * 0.72)
            rafBack.current = requestAnimationFrame(tick)
        }
        rafBack.current = requestAnimationFrame(tick)
    }, [setRevealBoth])

    useEffect(() => {
        const el = ref.current
        if (!el) return

        const onPointerDown = (e: PointerEvent) => {
            if (e.button !== 0 && e.pointerType === 'mouse') return
            const t = e.target as HTMLElement | null
            if (t?.closest('textarea, input, button, a, [contenteditable="true"]')) return
            if (rafBack.current != null) {
                cancelAnimationFrame(rafBack.current)
                rafBack.current = null
            }
            pointerId.current = e.pointerId
            axisRef.current = null
            startX.current = e.clientX
            startY.current = e.clientY
            startReveal.current = revealRef.current
        }

        const onPointerMove = (e: PointerEvent) => {
            if (pointerId.current !== e.pointerId) return
            const dx = e.clientX - startX.current
            const dy = e.clientY - startY.current
            if (axisRef.current == null) {
                if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return
                axisRef.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
                if (axisRef.current === 'h') {
                    setActive(true)
                    try { el.setPointerCapture(e.pointerId) } catch { /* 캡처 실패해도 진행 */ }
                }
            }
            if (axisRef.current !== 'h') return
            e.preventDefault()
            // 왼쪽으로 끌면 dx < 0 → reveal 증가
            setRevealBoth(startReveal.current - dx)
        }

        const onPointerUp = (e: PointerEvent) => {
            if (pointerId.current !== e.pointerId) return
            const wasH = axisRef.current === 'h'
            pointerId.current = null
            axisRef.current = null
            try { el.releasePointerCapture(e.pointerId) } catch { /* */ }
            if (wasH) snapBack()
        }

        const onWheel = (e: WheelEvent) => {
            // 트랙패드 가로 스크롤(또는 shift+휠). 세로가 더 크면 건드리지 않는다
            const absX = Math.abs(e.deltaX)
            const absY = Math.abs(e.deltaY)
            if (absX < 1 || absX < absY) return
            e.preventDefault()
            if (rafBack.current != null) {
                cancelAnimationFrame(rafBack.current)
                rafBack.current = null
            }
            setActive(true)
            // deltaX > 0 = 오른쪽으로 스크롤 내용 = 왼쪽으로 밀어 드러냄
            setRevealBoth(revealRef.current + e.deltaX)
            if (wheelTimer.current) clearTimeout(wheelTimer.current)
            wheelTimer.current = setTimeout(() => snapBack(), WHEEL_IDLE_MS)
        }

        el.addEventListener('pointerdown', onPointerDown)
        el.addEventListener('pointermove', onPointerMove, { passive: false })
        el.addEventListener('pointerup', onPointerUp)
        el.addEventListener('pointercancel', onPointerUp)
        el.addEventListener('wheel', onWheel, { passive: false })
        return () => {
            el.removeEventListener('pointerdown', onPointerDown)
            el.removeEventListener('pointermove', onPointerMove)
            el.removeEventListener('pointerup', onPointerUp)
            el.removeEventListener('pointercancel', onPointerUp)
            el.removeEventListener('wheel', onWheel)
            if (wheelTimer.current) clearTimeout(wheelTimer.current)
            if (rafBack.current != null) cancelAnimationFrame(rafBack.current)
        }
    }, [setRevealBoth, snapBack])

    const style = { ['--os-reveal' as string]: `${reveal}px` } as CSSProperties
    const className = active ? 'os-messages--revealing' : undefined
    return { ref, style, className, reveal }
}

/** 한 메시지 묶음(보낸이+말풍선+부가 UI) + 오른쪽 시각 칸 */
export function MsgRow({
    side,
    createdAt,
    children,
}: {
    side: 'me' | 'bot'
    createdAt?: string | null
    children: ReactNode
}) {
    const label = formatMessageTime(createdAt)
    return (
        <div className={`os-msg-row ${side}`}>
            <div className="os-msg-main">{children}</div>
            <time
                className="os-msg-time"
                dateTime={createdAt || undefined}
                aria-hidden={label ? undefined : true}
            >
                {label}
            </time>
        </div>
    )
}
