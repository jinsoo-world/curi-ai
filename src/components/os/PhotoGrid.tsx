'use client'
// 내 말풍선에 붙은 사진 격자 — 1장=크게, 2~4장=2열, 5장 이상=3열. 누르면 크게 보기.
// 크게 보기: 아래로 끌면 닫힘, 좌우로 끌면 다음/이전 (폰·마우스). Esc / ←→ / 배경 탭도 닫기·넘기기.
// 열 수 계산은 domains/os/photos.ts (photoGridCols).

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { photoGridCols } from '@/domains/os/photos'

const DISMISS_PX = 88
const SWIPE_PX = 64

export default function PhotoGrid({ urls }: { urls: string[] }) {
    const [open, setOpen] = useState<number | null>(null)
    const cols = photoGridCols(urls.length)

    // 끄는 중 시각 피드백 (아래로 끌면 흐려지며 내려감, 좌우면 살짝 밀림)
    const [drag, setDrag] = useState({ x: 0, y: 0, active: false })
    const start = useRef<{ x: number; y: number; id: number } | null>(null)
    const moved = useRef(false)

    const close = useCallback(() => {
        setOpen(null)
        setDrag({ x: 0, y: 0, active: false })
        start.current = null
    }, [])

    // 크게 보기: Esc 로 닫기, ←→ 로 넘기기
    useEffect(() => {
        if (open === null) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close()
            if (e.key === 'ArrowRight') setOpen(i => i === null ? null : Math.min(urls.length - 1, i + 1))
            if (e.key === 'ArrowLeft') setOpen(i => i === null ? null : Math.max(0, i - 1))
        }
        document.addEventListener('keydown', onKey)
        // 배경 스크롤 막기 (폰에서 끌 때 뒤가 같이 움직이지 않게)
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = prev
        }
    }, [open, urls.length, close])

    const onPointerDown = (e: React.PointerEvent) => {
        // 닫기 단추는 기본 동작
        if ((e.target as HTMLElement).closest?.('.os-photo-view-x')) return
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
        moved.current = false
        setDrag({ x: 0, y: 0, active: true })
        e.currentTarget.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: React.PointerEvent) => {
        const s = start.current
        if (!s || s.id !== e.pointerId) return
        const dx = e.clientX - s.x
        const dy = e.clientY - s.y
        if (Math.abs(dx) + Math.abs(dy) > 6) moved.current = true
        // 세로가 더 크면 닫기 제스처, 가로는 넘기기 제스처
        if (Math.abs(dy) >= Math.abs(dx)) {
            setDrag({ x: 0, y: Math.max(0, dy), active: true })
        } else {
            setDrag({ x: dx, y: 0, active: true })
        }
    }

    const onPointerUp = (e: React.PointerEvent) => {
        const s = start.current
        if (!s || s.id !== e.pointerId) return
        const dx = e.clientX - s.x
        const dy = e.clientY - s.y
        start.current = null
        try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }

        // 거의 안 움직이고 배경을 탭 → 닫기 (사진 위 탭은 stopPropagation 으로 여기만)
        if (!moved.current) {
            if (e.target === e.currentTarget) close()
            else setDrag({ x: 0, y: 0, active: false })
            return
        }

        if (dy > DISMISS_PX && Math.abs(dy) >= Math.abs(dx)) {
            close()
            return
        }
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) && urls.length > 1 && open !== null) {
            if (dx < 0) setOpen(Math.min(urls.length - 1, open + 1))
            else setOpen(Math.max(0, open - 1))
        }
        setDrag({ x: 0, y: 0, active: false })
    }

    if (urls.length === 0) return null

    const opacity = drag.y > 0 ? Math.max(0.35, 1 - drag.y / 280) : 1
    const imgStyle: CSSProperties | undefined = drag.active
        ? { transform: `translate(${drag.x}px, ${drag.y}px)`, opacity, transition: 'none' }
        : undefined

    return (
        <>
            <div className="os-photo-grid" data-cols={cols} aria-label={`사진 ${urls.length}장`}>
                {urls.map((u, i) => (
                    <button key={`${u}-${i}`} className="os-photo-cell" onClick={() => setOpen(i)} aria-label={`사진 ${i + 1} 크게 보기`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={u} alt={`보낸 사진 ${i + 1}`} loading="lazy" />
                    </button>
                ))}
            </div>
            {open !== null && (
                <div
                    className="os-photo-view"
                    role="dialog"
                    aria-modal="true"
                    aria-label="사진 크게 보기"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={urls[open]}
                        alt={`보낸 사진 ${open + 1}`}
                        draggable={false}
                        style={imgStyle}
                        onDragStart={e => e.preventDefault()}
                    />
                    {urls.length > 1 && <span className="os-photo-view-count">{open + 1} / {urls.length}</span>}
                    <button type="button" className="os-photo-view-x" aria-label="닫기" onClick={close}>×</button>
                    <p className="os-photo-view-hint" aria-hidden>아래로 끌면 닫혀요</p>
                </div>
            )}
        </>
    )
}
