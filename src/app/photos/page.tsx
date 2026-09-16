'use client'

/**
 * 보관함(내가 만든 사진) — 전수조사 29번 「다시 올 이유가 없다」
 * 대표 지시 2026-09-16 = 「보관함으로 이름 바꿔」. 아래 고정 메뉴와 같은 말을 쓴다.
 *
 * 대표 지시 2026-09-15 = 「48시간 이내까지 다운 가능. 그 이후에는 없어진다고 해」
 * 사진이 남아 있으니 다시 와서 받을 수 있고, 사라지기 전에 알아볼 수도 있다.
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AppSidebar from '@/components/AppSidebar'
import { 옵션읽기 } from '@/lib/photo-opts'
import { createClient } from '@/lib/supabase/client'

interface 사진 { id: string; kind: string; url: string; createdAt: string; expiresAt: string; options?: string | null }

// 대표 지적 2026-09-16 = 「만든 사진이라고만 되어있네」
// 강사 도구는 kind 를 'teacher' 로 보내는데 여기 표에는 'teacher-photo' 만 있었다.
// 표에 없는 값이 오면 「만든 사진」으로 떨어져 이름이 사라졌다. 도구가 실제로 보내는 값을 전부 적는다.
const 이름 : Record<string, string> = {
    teacher: '강사 프로필',
    'teacher-photo': '강사 프로필',
    actor: '배우 프로필',
    'actor-photo': '배우 프로필',
    'id-photo': '증명사진',
    id: '증명사진',
    enhance: '화질 개선',
    thumbnail: '썸네일',
    insta: '인스타 프로필',
    photo: '프로필 사진',
    'profile-photo': '프로필 사진',
    reemploy: '재취업 프로필',
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
    const [옵션, set옵션] = useState<Record<string, string>>({})
    const [로그인함, set로그인함] = useState<boolean | null>(null)

    useEffect(() => {
        void (async () => {
            // 로그인 안 한 분에게는 「없어요」가 아니라 「로그인하면 보여요」라고 해야 맞다
            // (대표 모바일 점검 2026-09-16)
            try {
                const { data: { session } } = await createClient().auth.getSession()
                set로그인함(!!session?.user)
            } catch { set로그인함(null) }
            try {
                const r = await fetch('/api/photos/list')
                const d = await r.json()
                const 목록 = d.photos ?? []
                set사진들(목록)
                const 표: Record<string, string> = {}
                // 서버(tool_photos.options)가 먼저다. 없으면 이 브라우저에 적어둔 것으로 채운다
                for (const p of 목록) { const t = p.options || 옵션읽기(p.url); if (t) 표[p.url] = t }
                set옵션(표)
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
                    보관함
                </h1>
                <p style={{ fontSize: 16, color: 'var(--먹연)', margin: '0 0 24px', lineHeight: 1.6 }}>
                    만든 사진은 48시간 동안 여기 있습니다. 그 뒤에는 지워지니 미리 내려받아 두세요.
                </p>

                {사진들 === null && <p style={{ fontSize: 16, color: '#a1a1aa' }}>불러오는 중입니다</p>}

                {사진들?.length === 0 && (
                    <div style={{ background: '#fff', border: '1px solid #e4e4e7', borderRadius: 18, padding: '36px 22px', textAlign: 'center' }}>
                        <p style={{ fontSize: 17, fontWeight: 800, margin: '0 0 8px' }}>
                            {로그인함 === false ? '로그인하면 만든 사진이 보여요' : '아직 만든 사진이 없어요'}
                        </p>
                        <p style={{ fontSize: 15.5, color: '#71717a', margin: '0 0 18px', lineHeight: 1.6, wordBreak: 'keep-all' }}>
                            {로그인함 === false
                                ? '만든 사진은 로그인한 분의 것만 48시간 동안 남습니다.'
                                : '사진 한 장만 있으면 바로 만들 수 있습니다.'}
                        </p>
                        <Link href={로그인함 === false ? '/login' : '/studio'} style={{
                            display: 'inline-block', background: '#1C2321', color: '#fff',
                            padding: '14px 28px', borderRadius: 999, fontWeight: 800, fontSize: 16, textDecoration: 'none',
                        }}>{로그인함 === false ? '로그인하기' : '만들러 가기'}</Link>
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
                                    {/* 어떤 옵션으로 만들었는지 — 대표 지시 2026-09-16 「간략 표기 더해줘」
                                        만든 그 브라우저에만 적어둔 값이라 없을 수도 있다. 없으면 줄 자체가 안 나온다. */}
                                    {옵션[p.url] && (
                                        <div style={{
                                            fontSize: 13, color: 'var(--먹연)', marginTop: 3,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}>{옵션[p.url]}</div>
                                    )}
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
