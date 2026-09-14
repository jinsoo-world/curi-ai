'use client'

/**
 * 위쪽 띠 — 화면 전체의 뼈대
 *
 * 대표 지시 2026-09-14 = 「UI 전체적으로 다시 잡아. 다시 개편해」
 *
 * 왜 사이드바를 버렸나 = 왼쪽 240px 을 늘 먹고 있어서 사진이 들어갈 자리가
 * 없었다. 대표가 보여준 두 화면(모니카·pfpmaker)은 둘 다 위쪽 얇은 띠 하나에
 * 메뉴를 넣고 나머지를 전부 그림에 쓴다. 이름은 그대로 둔다(13개 화면이 이미
 * 이 이름으로 부르고 있어서, 이름을 바꾸면 관계없는 파일을 13개 건드리게 된다).
 */
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

const 메뉴 = [
    { label: '만들기', href: '/studio' },
    { label: '코치와 대화', href: '/mentors' },
    { label: '내 AI', href: '/creator/manage' },
    { label: '내 대화', href: '/chats' },
]

export default function AppSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [열림, set열림] = useState(false)
    const [잔액, set잔액] = useState<number | null>(null)
    const [사진, set사진] = useState<string | null>(null)
    const [이름, set이름] = useState<string | null>(null)

    const 불러오기 = useCallback(async () => {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: row } = await supabase
            .from('users')
            .select('name, clovers, avatar_url')
            .eq('id', user.id)
            .single()
        set잔액(row?.clovers ?? 0)
        set사진(row?.avatar_url ?? null)
        set이름(row?.name ?? null)
    }, [])

    useEffect(() => { void 불러오기() }, [불러오기])

    // 화면을 옮기면 펼친 메뉴를 닫는다
    useEffect(() => { set열림(false) }, [pathname])

    const 지금 = (href: string) => pathname === href || pathname.startsWith(href + '/')

    return (
        <header className="app-top">
            <div className="app-top-inner">
                {/* 왼쪽 — 이름표 */}
                <Link href="/mentors" className="app-top-logo" aria-label="큐리 AI 첫 화면">
                    <Image src="/logo.png" alt="" width={30} height={30} style={{ borderRadius: 9 }} />
                    <span>큐리 AI</span>
                </Link>

                {/* 가운데 — 메뉴 (넓은 화면에서만) */}
                <nav className="app-top-nav">
                    {메뉴.map((m) => (
                        <Link
                            key={m.href}
                            href={m.href}
                            className={지금(m.href) ? 'app-top-link on' : 'app-top-link'}
                        >
                            {m.label}
                        </Link>
                    ))}
                </nav>

                {/* 오른쪽 — 남은 개수와 나 */}
                <div className="app-top-right">
                    <Link href="/charge" className="app-top-credit">
                        <span className="app-top-credit-num">{잔액 === null ? '–' : 잔액.toLocaleString()}</span>
                        <span className="app-top-credit-plus">충전</span>
                    </Link>

                    <button
                        type="button"
                        className="app-top-me"
                        onClick={() => set열림((v) => !v)}
                        aria-label="내 메뉴"
                        aria-expanded={열림}
                    >
                        {사진 ? (
                            <Image src={사진} alt="" width={34} height={34} style={{ objectFit: 'cover' }} />
                        ) : (
                            <span>{(이름 ?? '나').slice(0, 1)}</span>
                        )}
                    </button>
                </div>
            </div>

            {/* 펼친 메뉴 — 좁은 화면의 메뉴이자 넓은 화면의 내 메뉴 */}
            {열림 && (
                <div className="app-top-sheet">
                    {메뉴.map((m) => (
                        <Link key={m.href} href={m.href} className="app-top-sheet-item">{m.label}</Link>
                    ))}
                    <Link href="/missions" className="app-top-sheet-item">무료로 모으기</Link>
                    <Link href="/store" className="app-top-sheet-item">스토어</Link>
                    <Link href="/profile" className="app-top-sheet-item">마이페이지</Link>
                    <button
                        type="button"
                        className="app-top-sheet-item"
                        onClick={async () => {
                            await createClient().auth.signOut()
                            router.push('/login')
                        }}
                    >
                        로그아웃
                    </button>
                </div>
            )}
        </header>
    )
}
