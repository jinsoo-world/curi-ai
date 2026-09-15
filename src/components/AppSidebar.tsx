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
import CloverIcon from '@/components/ui/CloverIcon'
import { 브라우저표식 } from '@/lib/browser-mark'
import { 클로버듣기 } from '@/lib/clover-bus'

// 대표 확정 0914 = 「만들기ㅣ대화하기ㅣ내 AI 로 해」 「내 대화는 없애 굳이 필요 없을듯」
const 메뉴 = [
    { label: '만들기', href: '/studio' },
    { label: '대화하기', href: '/mentors' },
    { label: '내 AI', href: '/creator/manage' },
    // 대표 지시 0915 = 「친구초대로 이름 바꿔. 그리고 친구초대를 상단 띠에 띄워」
    { label: '친구초대', href: '/invite' },
]

export default function AppSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [열림, set열림] = useState(false)
    const [잔액, set잔액] = useState<number | null>(null)
    const [사진, set사진] = useState<string | null>(null)
    const [이름, set이름] = useState<string | null>(null)
    const [추천코드, set추천코드] = useState<string | null>(null)
    const [복사됨, set복사됨] = useState(false)

    const 불러오기 = useCallback(async () => {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        // 손님도 클로버를 갖는다 — 대표 확정 2026-09-15 「클로버 60개를 주면 되잖아」
        // 계정이 없으니 서버가 「하루 동안 쓴 값」을 빼서 알려준다.
        if (!user) {
            try {
                const 표식 = 브라우저표식()
                const r = await fetch(`/api/guest/balance${표식 ? `?mark=${encodeURIComponent(표식)}` : ''}`)
                const d = await r.json()
                if (d?.손님) set잔액(d.balance ?? 0)
            } catch {
                // 못 물어보면 그냥 비워둔다
            }
            return
        }

        const { data: row } = await supabase
            .from('users')
            .select('name, clovers, avatar_url, referral_code')
            .eq('id', user.id)
            .single()
        set잔액(row?.clovers ?? 0)
        set사진(row?.avatar_url ?? null)
        set이름(row?.name ?? null)
        set추천코드(row?.referral_code ?? null)
    }, [])

    useEffect(() => { void 불러오기() }, [불러오기])

    // 클로버가 바뀌면 바로 반영한다 (받기·사진 만들기·충전)
    useEffect(() => 클로버듣기(v => set잔액(v)), [])

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
                    <Link data-guide="guide-clover" href="/charge" className="app-top-credit" aria-label="클로버 충전하기">
                        <CloverIcon size={34} />
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
                            <Image src={사진} alt="" width={38} height={38} style={{ objectFit: 'cover' }} />
                        ) : (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                                <circle cx="12" cy="8.5" r="3.6" fill="#8A948E" />
                                <path d="M4.8 20c0-3.4 3.2-5.6 7.2-5.6s7.2 2.2 7.2 5.6" fill="#8A948E" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            {/* 내 메뉴 — 대표 지적 0914 「나 이렇게 되어있는데 다시 재기획해. 깔끔하게」
                넓은 화면에서는 위 띠에 이미 있는 메뉴를 또 보여주지 않는다. */}
            {열림 && (
                <>
                    <button
                        type="button"
                        aria-label="메뉴 닫기"
                        className="app-top-scrim"
                        onClick={() => set열림(false)}
                    />
                    <div className="app-top-sheet" role="menu" onClick={() => set열림(false)}>
                        <div className="app-top-sheet-head">
                            <Link
                                href="/profile"
                                className="app-top-sheet-name"
                                style={{ textDecoration: 'none', color: 'inherit', flex: 1, padding: '4px 0' }}
                            >
                                {이름 ?? '내 계정'}
                            </Link>
                            <Link href="/charge" className="app-top-sheet-credit">
                                <CloverIcon size={15} />
                                {잔액 === null ? '–' : 잔액.toLocaleString()}개
                            </Link>
                        </div>

                        <div>
                            {메뉴.map((m) => (
                                <Link key={m.href} href={m.href} className="app-top-sheet-item">{m.label}</Link>
                            ))}
                            <div className="app-top-sheet-line" />
                        </div>

                        {추천코드 && (
                            <button
                                type="button"
                                className="app-top-sheet-item"
                                onClick={async () => {
                                    try {
                                        await navigator.clipboard.writeText(`${window.location.origin}/mentors?ref=${추천코드}`)
                                        set복사됨(true)
                                        setTimeout(() => set복사됨(false), 2000)
                                    } catch {
                                        // 복사가 막힌 브라우저면 친구초대 화면에서 길게 눌러 복사한다
                                    }
                                }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                            >
                                <span>내 추천코드 {추천코드}</span>
                                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--진초록)' }}>
                                    {복사됨 ? '복사됨' : '복사'}
                                </span>
                            </button>
                        )}

                        <Link href="/charge" className="app-top-sheet-item">클로버 충전</Link>
                        <Link href="/invite" className="app-top-sheet-item">친구초대</Link>
                        <Link href="/photos" className="app-top-sheet-item">내가 만든 사진</Link>
                        <Link href="/missions" className="app-top-sheet-item">무료로 모으기</Link>
                        <Link href="/profile" className="app-top-sheet-item">마이페이지</Link>
                        <div className="app-top-sheet-line" />
                        <button
                            type="button"
                            className="app-top-sheet-item quiet"
                            onClick={async () => {
                                await createClient().auth.signOut()
                                router.push('/login')
                            }}
                        >
                            로그아웃
                        </button>
                    </div>
                </>
            )}

        </header>
    )
}

/**
 * 위 띠와 아래 탭바를 같이 내보낸다.
 * 화면 13개가 이미 AppSidebar 를 부르고 있어서, 여기 붙이면 한 번에 다 적용된다.
 */
