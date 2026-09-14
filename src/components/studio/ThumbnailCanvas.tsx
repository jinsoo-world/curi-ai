'use client'

/**
 * 썸네일 글자 얹기 — 브라우저에서 한다
 *
 * 2026-09-15 확인 = 배포 서버에서 「가나다라마바사」가 네모 한 덩어리로 찍혔다.
 * Vercel 리눅스에 한글 폰트가 없고, sharp 의 SVG 렌더러는 시스템 폰트만 본다.
 * 브라우저에는 한글 폰트가 있으니 여기서 그리면 깨지지 않는다.
 */
import { useEffect, useRef, useState } from 'react'

export interface 글자값 {
    title: string
    subtitle: string
    width: number
    height: number
    textColor: string
    subColor: string
    shade: string
}

/** 글자가 길면 줄을 나눈다 — 실제 글자 폭으로 잰다 */
function 줄나눔(ctx: CanvasRenderingContext2D, 글: string, 최대폭: number): string[] {
    const 낱말 = 글.split(' ')
    const 줄: string[] = []
    let 지금 = ''
    for (const w of 낱말) {
        const 붙임 = 지금 ? `${지금} ${w}` : w
        if (ctx.measureText(붙임).width > 최대폭 && 지금) {
            줄.push(지금)
            지금 = w
        } else {
            지금 = 붙임
        }
    }
    if (지금) 줄.push(지금)
    return 줄.slice(0, 3)
}

export default function ThumbnailCanvas({
    background,
    text,
    blurred = false,
    onReady,
}: {
    /** 서버가 만든 배경 (data URL) */
    background: string
    text: 글자값
    blurred?: boolean
    onReady?: (dataUrl: string) => void
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [그렸나, set그렸나] = useState(false)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const img = new window.Image()
        img.onload = () => {
            const W = text.width
            const H = text.height
            canvas.width = W
            canvas.height = H

            ctx.drawImage(img, 0, 0, W, H)

            // 글자 뒤 그늘 — 배경이 밝든 어둡든 읽히게
            const g = ctx.createLinearGradient(0, H * 0.24, 0, H)
            g.addColorStop(0, '#00000000')
            g.addColorStop(0.28, text.shade)
            g.addColorStop(1, text.shade)
            ctx.fillStyle = g
            ctx.fillRect(0, H * 0.24, W, H * 0.76)

            const 가로긴가 = W > H
            const 제목크기 = Math.round(W * (가로긴가 ? 0.085 : 0.105))
            const 부제크기 = Math.round(제목크기 * 0.42)
            const 줄간격 = Math.round(제목크기 * 1.24)
            const 글꼴 = '"Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif'

            ctx.textAlign = 'center'
            ctx.textBaseline = 'alphabetic'
            ctx.font = `900 ${제목크기}px ${글꼴}`
            ctx.fillStyle = text.textColor

            const 줄들 = 줄나눔(ctx, text.title, W * 0.86)
            const 시작Y = Math.round(H * 0.5 - ((줄들.length - 1) * 줄간격) / 2 + 제목크기 * 0.34)
            줄들.forEach((l, i) => ctx.fillText(l, W / 2, 시작Y + i * 줄간격))

            if (text.subtitle) {
                ctx.font = `700 ${부제크기}px ${글꼴}`
                ctx.fillStyle = text.subColor
                ctx.fillText(text.subtitle, W / 2, 시작Y + 줄들.length * 줄간격 + Math.round(부제크기 * 0.5))
            }

            set그렸나(true)
            try {
                onReady?.(canvas.toDataURL('image/png'))
            } catch {
                // 다른 곳에서 온 그림이면 toDataURL 이 막힌다. 화면에는 그대로 보인다.
            }
        }
        img.src = background
    }, [background, text, onReady])

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: '100%',
                height: 'auto',
                borderRadius: 16,
                border: '1px solid #e4e4e7',
                display: 'block',
                filter: blurred ? 'blur(6px)' : undefined,
                opacity: 그렸나 ? 1 : 0.4,
                transition: 'opacity 200ms ease',
            }}
        />
    )
}
