'use client'

/**
 * 내가 만든 사진 — 전수조사 29번 「다시 올 이유가 없다」
 *
 * 대표 지시 2026-09-15 = 「48시간 이내까지 다운 가능. 그 이후에는 없어진다고 해」
 * 사진이 남아 있으니 다시 와서 받을 수 있고, 사라지기 전에 알아볼 수도 있다.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppSidebar from '@/components/AppSidebar'

interface 사진 { id: string; kind: string; url: string; createdAt: string; expiresAt: string }

const 이름 : Record<string, string> = {
    'id-photo': '증명사진',
    'teacher-photo': '강사 프로필',
    'actor-photo': '배우 프로필',
    actor: '배우 프로필',
    enhance: '화질 개선',
    thumbnail: '썸네일',
    insta: '인스타 프로필',
    'profile-photo': '프로필 사진',
}

function 남은시간(expiresAt: string) {
    const 초 = (new Date(expiresAt).getTime() - Date.now()) / 1000
    if (초 <= 0) return '곧 사라집니다'
    const 시간 = Math.floor(초 / 3600)
    if (시간 >= 1) return `${시간}시간 뒤 사라집니다`
    return `${Math.max(1, Math.floor(초 / 60))}분 뒤 사라집니다`
}

export default function Page() {
    const [사진들, set사진들] = useState<사진[] | null>(null)

    useEffect(() => {
        void (async () => {
            try {
                const r = await fetch('/api/photos/list')
                const d = await r.json()
                set사진들(d.photos ?? [])
            } catch {
                set사진들([])
            }
        })()
    }, [])

    return (
        <main style={{ minHeight: '100dvh', background: 'var(--종이)' }}>
            <AppSidebar />
            <div style={{ maxWidth: 1000, margin: '0 auto', padding: '30px 18px 90px' }}>
                <h1 style={{ fontSize: 'var(--글자-대)', fontWeight: 900, letterSpacing: '-0.04em', margin: '0 0 8px' }}>
                    내가 만든 사진
                </h1>
                <p style={{ fontSize: 16, color: 'var(--먹연)', margin: '0 0 24px', lineHeight: 1.6 }}>
                    만든 사진은 48시간 동안 여기 있습니다. 그 뒤에는 지워지니 미리 내려받아 두세요.
                </p>

                {사진들 === null && <p style={{ fontSize: 16, color: '#a1a1aa' }}>불러오는 중입니다</p>}

                {사진들?.length === 0 && (
                    <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 18, padding: '36px 22px', textAlign: 'center' }}>
                        <p style={{ fontSize: 17, fontWeight: 800, margin: '0 0 8px' }}>아직 만든 사진이 없어요</p>
                        <p style={{ fontSize: 15.5, color: '#71717a', margin: '0 0 18px' }}>사진 한 장만 있으면 바로 만들 수 있습니다.</p>
                        <Link href="/studio" style={{
                            display: 'inline-block', background: '#1C2321', color: '#fff',
                            padding: '14px 28px', borderRadius: 999, fontWeight: 800, fontSize: 16, textDecoration: 'none',
                        }}>만들러 가기</Link>
                    </div>
                )}

                {!!사진들?.length && (
                    <div className="look-grid">
                        {사진들.map((p) => (
                            <div key={p.id} style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 16, overflow: 'hidden' }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={p.url} alt={이름[p.kind] ?? '만든 사진'} style={{ width: '100%', display: 'block', aspectRatio: '4 / 5', objectFit: 'cover' }} />
                                <div style={{ padding: '10px 12px 12px' }}>
                                    <div style={{ fontSize: 15, fontWeight: 800 }}>{이름[p.kind] ?? '만든 사진'}</div>
                                    <div style={{ fontSize: 13.5, color: '#a1a1aa', marginTop: 2 }}>{남은시간(p.expiresAt)}</div>
                                    <a href={p.url} download style={{
                                        display: 'block', marginTop: 8, padding: '10px 8px', borderRadius: 11,
                                        background: '#18181b', color: '#fff', fontSize: 15, fontWeight: 700,
                                        textAlign: 'center', textDecoration: 'none',
                                    }}>내려받기</a>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </main>
    )
}
