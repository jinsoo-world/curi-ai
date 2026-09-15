'use client'

/**
 * 올린 사진 보여주기 — 대표 지적 2026-09-15
 * 「사진 첨부하면 그 첨부한 사진이 떠야지. 바로 뭘만들까를 물어보면 어쩌냐」
 *
 * 첫 화면에서 사진을 올리면 「무엇을 만들까요」로 넘어오는데,
 * 정작 올린 사진은 어디에도 안 보였다. 내가 뭘 올렸는지 확인이 안 되면 불안하다.
 */
import { useEffect, useState } from 'react'
import { HERO_PHOTO_KEY } from '@/components/studio/PhotoHero'

export default function UploadedPeek() {
    const [사진, set사진] = useState<string | null>(null)

    useEffect(() => {
        // 저장소는 React 바깥이라 여기서 한 번 읽어 온다(읽기만 하고 지우지 않는다.
        // 도구 화면이 이어받아 써야 하기 때문이다)
        try {
            const raw = sessionStorage.getItem(HERO_PHOTO_KEY)
            if (!raw) return
            const { dataUrl } = JSON.parse(raw) as { dataUrl?: string }
            if (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/')) {
                // eslint-disable-next-line react-hooks/set-state-in-effect
                set사진(dataUrl)
            }
        } catch {
            // 저장소를 못 읽는 브라우저면 그냥 안 보여준다
        }
    }, [])

    if (!사진) return null

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: '#fff',
                border: '1px solid #e4e4e7',
                borderRadius: 18,
                padding: 14,
                marginBottom: 20,
            }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={사진}
                alt="올리신 사진"
                style={{
                    width: 92,
                    height: 115,
                    objectFit: 'cover',
                    borderRadius: 12,
                    flexShrink: 0,
                    background: '#E8E8E4',
                }}
            />
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16.5, fontWeight: 800, marginBottom: 4 }}>이 사진을 올리셨어요</div>
                <p style={{ fontSize: 15, color: '#71717a', margin: 0, lineHeight: 1.6, wordBreak: 'keep-all' }}>
                    아래에서 무엇을 만들지 고르시면 이 사진이 그대로 넘어갑니다.
                </p>
            </div>
        </div>
    )
}
