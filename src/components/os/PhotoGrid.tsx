'use client'
// 내 말풍선에 붙은 사진 격자 — 1장=크게, 2~4장=2열, 5장 이상=3열. 누르면 크게 보기(간단한 덮개).
// 열 수 계산은 domains/os/photos.ts (photoGridCols).

import { useEffect, useState } from 'react'
import { photoGridCols } from '@/domains/os/photos'

export default function PhotoGrid({ urls }: { urls: string[] }) {
    const [open, setOpen] = useState<number | null>(null)
    const cols = photoGridCols(urls.length)

    // 크게 보기: Esc 로 닫기, ←→ 로 넘기기
    useEffect(() => {
        if (open === null) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(null)
            if (e.key === 'ArrowRight') setOpen(i => i === null ? null : Math.min(urls.length - 1, i + 1))
            if (e.key === 'ArrowLeft') setOpen(i => i === null ? null : Math.max(0, i - 1))
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [open, urls.length])

    if (urls.length === 0) return null

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
                <div className="os-photo-view" role="dialog" aria-label="사진 크게 보기" onClick={() => setOpen(null)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urls[open]} alt={`보낸 사진 ${open + 1}`} onClick={e => e.stopPropagation()} />
                    {urls.length > 1 && <span className="os-photo-view-count">{open + 1} / {urls.length}</span>}
                    <button className="os-photo-view-x" aria-label="닫기" onClick={() => setOpen(null)}>×</button>
                </div>
            )}
        </>
    )
}
