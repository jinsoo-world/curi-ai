'use client'

/**
 * 전/후 비교 — 손잡이를 끌면 갈라진다
 *
 * 대표 지시 2026-09-15 = 「사진 화질 개선하기. 그리고 사용자가 마우스나 드래그 하면 되도록」
 * (remini.ai 의 전후 비교 화면을 보여주며)
 *
 * 마우스·손가락·키보드 화살표 셋 다 받는다. 중장년은 정확히 끌기가 어려워서
 * 사진 아무 데나 눌러도 그 자리로 선이 옮겨가게 했다.
 */
import { useCallback, useRef, useState } from 'react'

export default function BeforeAfter({
    before,
    after,
    beforeLabel = '원본',
    afterLabel = '고친 사진',
    ratio = '3 / 4',
}: {
    before: string
    after: string
    beforeLabel?: string
    afterLabel?: string
    ratio?: string
}) {
    const [자리, set자리] = useState(50)
    const 틀 = useRef<HTMLDivElement>(null)
    const 끄는중 = useRef(false)

    const 옮기기 = useCallback((clientX: number) => {
        const el = 틀.current
        if (!el) return
        const r = el.getBoundingClientRect()
        const p = ((clientX - r.left) / r.width) * 100
        set자리(Math.max(0, Math.min(100, p)))
    }, [])

    return (
        <div
            ref={틀}
            onPointerDown={(e) => {
                끄는중.current = true
                e.currentTarget.setPointerCapture(e.pointerId)
                옮기기(e.clientX)
            }}
            onPointerMove={(e) => { if (끄는중.current) 옮기기(e.clientX) }}
            onPointerUp={(e) => {
                끄는중.current = false
                e.currentTarget.releasePointerCapture(e.pointerId)
            }}
            style={{
                position: 'relative',
                width: '100%',
                aspectRatio: ratio,
                borderRadius: 16,
                overflow: 'hidden',
                background: '#E8E8E4',
                touchAction: 'none',
                cursor: 'ew-resize',
                userSelect: 'none',
            }}
        >
            {/* 뒤: 고친 사진 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={after} alt={afterLabel} draggable={false}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />

            {/* 앞: 원본 — 손잡이 왼쪽만 보인다.
                안쪽 그림은 100/자리 배로 늘려 바깥 폭과 같게 만든다(그래야 두 사진이 안 어긋난다) */}
            <div style={{ position: 'absolute', inset: 0, width: `${자리}%`, overflow: 'hidden' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={before} alt={beforeLabel} draggable={false}
                    style={{
                        position: 'absolute', top: 0, left: 0, height: '100%',
                        width: 자리 > 0 ? `${(100 / 자리) * 100}%` : '100%',
                        maxWidth: 'none', objectFit: 'cover',
                    }} />
            </div>

            {/* 손잡이 */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${자리}%`, width: 2, background: '#fff', boxShadow: '0 0 8px rgba(0,0,0,0.35)' }} />
            <button
                type="button"
                aria-label="전후 비교 손잡이"
                onKeyDown={(e) => {
                    if (e.key === 'ArrowLeft') set자리(v => Math.max(0, v - 4))
                    if (e.key === 'ArrowRight') set자리(v => Math.min(100, v + 4))
                }}
                style={{
                    position: 'absolute', top: '50%', left: `${자리}%`,
                    transform: 'translate(-50%, -50%)',
                    width: 44, height: 44, borderRadius: 999,
                    border: 'none', background: '#fff',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                    display: 'grid', placeItems: 'center',
                    fontSize: 15, fontWeight: 900, color: '#18181b',
                    cursor: 'ew-resize',
                }}
            >
                ‹›
            </button>

            <span style={딱지(12, 'left')}>{beforeLabel}</span>
            <span style={딱지(12, 'right')}>{afterLabel}</span>
        </div>
    )
}

function 딱지(여백: number, 쪽: 'left' | 'right'): React.CSSProperties {
    return {
        position: 'absolute',
        top: 여백,
        [쪽]: 여백,
        background: 'rgba(0,0,0,0.62)',
        color: '#fff',
        fontSize: 12.5,
        fontWeight: 700,
        padding: '5px 11px',
        borderRadius: 999,
        pointerEvents: 'none',
    }
}
