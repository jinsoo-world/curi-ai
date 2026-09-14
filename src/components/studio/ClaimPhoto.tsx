'use client'

/**
 * 로그인하고 돌아오면 방금 만든 사진을 찾아준다 — 전수조사 2번
 *
 * 그동안 가장 크게 새던 자리다. 비회원이 흐린 사진을 보고 로그인하면
 * 방금 만든 사진이 통째로 사라졌다. 이제 서버가 선명한 원본을 보관해 두므로
 * 「찾아가는 표」만 들고 오면 된다.
 */
import { useEffect, useState } from 'react'
import { 센다 } from '@/lib/track'

export default function ClaimPhoto() {
    const [url, setUrl] = useState<string | null>(null)
    const [알림, set알림] = useState<string | null>(null)

    useEffect(() => {
        let 표: string | null = null
        try {
            표 = sessionStorage.getItem('curi_claim')
        } catch {
            return
        }
        if (!표) return

        void (async () => {
            try {
                const r = await fetch('/api/photos/claim', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ claimToken: 표 }),
                })
                const d = await r.json()
                try { sessionStorage.removeItem('curi_claim') } catch {}
                if (r.ok && d.url) {
                    setUrl(d.url)
                    센다('photo_download', { tool: 'claim' })
                } else if (d.error) {
                    set알림(d.error)
                }
            } catch {
                // 조용히 넘어간다. 보관함(/photos)에서 찾을 수 있다.
            }
        })()
    }, [])

    if (!url && !알림) return null

    return (
        <div style={{
            background: '#fff', border: '1px solid #e4e4e7', borderRadius: 18,
            padding: '18px 18px 16px', margin: '0 0 18px',
        }}>
            {url ? (
                <>
                    <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 8 }}>방금 만든 사진이 여기 있어요</div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="방금 만든 사진" style={{ width: '100%', maxWidth: 320, borderRadius: 14, display: 'block', margin: '0 auto' }} />
                    <a href={url} download style={{
                        display: 'block', marginTop: 12, padding: 14, borderRadius: 14,
                        background: '#18181b', color: '#fff', fontSize: 16, fontWeight: 800,
                        textAlign: 'center', textDecoration: 'none',
                    }}>선명한 사진 내려받기</a>
                </>
            ) : (
                <p style={{ fontSize: 15.5, color: '#71717a', margin: 0, lineHeight: 1.6 }}>{알림}</p>
            )}
        </div>
    )
}
