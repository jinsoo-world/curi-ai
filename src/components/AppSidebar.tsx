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
import { 클로버듣기, 클로버알림, 클로버씀듣기 } from '@/lib/clover-bus'
import { SIGNUP_CLOVERS } from '@/domains/trial'
import CloverCount from '@/components/studio/CloverCount'

// Delphi 스타일 UX 개편 2026-09-22 — 프로필 사진 도구를 별도 탭으로 분리
// 
// 메인 제품은 AI 멘토 발견/생성, 프로필 사진 생성 도구는 독립적인 섹션으로 명확히 분리
const 메뉴 = [
    { label: '발견', href: '/mentors' },
    { label: 'AI 만들기', href: '/creator/create' },
    { label: '프로필 사진', href: '/tools' },
    { label: '채팅', href: '/chats' },
]

export default function AppSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [열림, set열림] = useState(false)

    // 아래 고정 메뉴의 「더보기」가 이 서랍을 연다 (렌트리 참고 2026-09-16)
    useEffect(() => {
        const 열기 = () => set열림(true)
        window.addEventListener('curi:open-menu', 열기)
        return () => window.removeEventListener('curi:open-menu', 열기)
    }, [])
    const [잔액, set잔액] = useState<number | null>(null)
    const [사진, set사진] = useState<string | null>(null)
    const [이름, set이름] = useState<string | null>(null)
    const [추천코드, set추천코드] = useState<string | null>(null)
    const [복사됨, set복사됨] = useState(false)
    // 로그인했는지 — 대표 지적 2026-09-15 「로그인도 안했는데 뭔 로그아웃이야」
    const [로그인함, set로그인함] = useState<boolean | null>(null)

    const 불러오기 = useCallback(async () => {
        const supabase = createClient()
        // 화면을 여는 신원 확인은 getSession 으로 — getUser 는 부를 때마다 서버에 다녀온다(2026-09-16 실측 수 초)
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user ?? null

        // 손님도 클로버를 갖는다 — 대표 확정 2026-09-15 「클로버 60개를 주면 되잖아」
        // 계정이 없으니 서버가 「하루 동안 쓴 값」을 빼서 알려준다.
        if (!user) {
            set로그인함(false)
            try {
                const 표식 = 브라우저표식()
                const r = await fetch(`/api/guest/balance${표식 ? `?mark=${encodeURIComponent(표식)}` : ''}`)
                const d = await r.json()
                if (d?.손님) { set잔액(d.balance ?? 0); 클로버알림(d.balance ?? 0) }
            } catch {
                // 못 물어보면 그냥 비워둔다
            }
            return
        }

        set로그인함(true)

        // 잔액은 따로 읽는다 — 대표 지적 2026-09-15 「왜 클로버가 0개임」
        // 한 번에 여러 칸을 물으면 그중 하나만 없어도 통째로 실패해 잔액이 0으로 보인다.
        // 돈에 해당하는 숫자라 이것만은 따로, 먼저 읽는다.
        const { data: 잔액행, error: 잔액오류 } = await supabase
            .from('users')
            .select('clovers')
            .eq('id', user.id)
            .single()
        if (잔액오류) console.error('[띠] 잔액을 못 읽었다:', 잔액오류.message)
        set잔액(잔액행?.clovers ?? 0)
        클로버알림(잔액행?.clovers ?? 0)

        // 가입 선물을 아직 못 받았으면 여기서 받는다 — 대표 지적 2026-09-15 「왜 클로버가 0개임」
        //
        // 원래는 로그인 콜백에서만 줬는데, 그 자리는 「users 행이 아직 없을 때」 안에 있었고
        // Supabase 는 가입 순간 그 행을 먼저 만든다. 그래서 아무도 못 받았다.
        // 콜백도 고쳤지만 그 길은 구글·카카오 로그인만 지난다. 여기서 한 번 더 확인해
        // 이미 가입한 분들도 화면을 열면 받게 한다. 두 번 주는 것은 서버가 막는다.
        if (!잔액행?.clovers) {
            try {
                const r = await fetch('/api/credits/signup-bonus', { method: 'POST' })
                const j = await r.json()
                if (j?.success && typeof j.balance === 'number') {
                    set잔액(j.balance)
                    클로버알림(j.balance)
                }
            } catch {
                // 못 받아도 화면은 그대로 둔다
            }
        }

        // 나머지는 못 읽어도 잔액 표시를 막지 않는다
        const { data: row } = await supabase
            .from('users')
            .select('display_name, avatar_url, referral_code')
            .eq('id', user.id)
            .maybeSingle()
        set사진(row?.avatar_url ?? null)
        set이름(row?.display_name ?? null)
        set추천코드(row?.referral_code ?? null)
    }, [])

    useEffect(() => { void 불러오기() }, [불러오기])

    // 클로버가 바뀌면 바로 반영한다 (받기·사진 만들기·충전)
    useEffect(() => 클로버듣기(v => set잔액(v)), [])

    // 방금 쓴 만큼 화면에서 바로 뺀다 — 대표 지적 2026-09-15 「만들기 누르면 애니메이션 효과로 차감되어야지」
    // 서버는 누르는 순간 빼지만 사진이 나오기까지 20초가 걸려 숫자가 그대로였다.
    useEffect(() => 클로버씀듣기(얼마 => set잔액(v => (v === null ? v : Math.max(0, v - 얼마)))), [])

    const 지금 = (href: string) => pathname === href || pathname.startsWith(href + '/')

    return (
        <header className="app-top">
            <div className="app-top-inner">
                {/* 왼쪽 — 이름표 */}
                <Link href="/" className="app-top-logo" aria-label="큐리 AI 홈">
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
                        <CloverCount 값={잔액} />
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
                                href={로그인함 ? '/profile' : '/login'}
                                className="app-top-sheet-name"
                                style={{ textDecoration: 'none', color: 'inherit', flex: 1, padding: '4px 0' }}
                            >
                                {로그인함 ? (이름 ?? '내 계정') : '로그인하기'}
                            </Link>
                            <Link href="/charge" className="app-top-sheet-credit">
                                <CloverIcon size={15} />
                                {잔액 === null ? '-' : 잔액.toLocaleString()}개
                            </Link>
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

                        {/* 로그인한 분에게만 보이는 칸 — 대표 지적 2026-09-15 「로그인도 안했는데 뭔 로그아웃이야」 */}
                        {로그인함 && (
                            <>
                                <Link href="/creator/manage" className="app-top-sheet-item">내 AI</Link>
                                <Link href="/invite" className="app-top-sheet-item">친구초대</Link>
                                <Link href="/charge" className="app-top-sheet-item">클로버 충전</Link>
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
                            </>
                        )}

                        {/* Delphi-style bottom CTA — CEO requirement 2026-09-22 */}
                        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
                            <Link
                                href="/creator/create"
                                className="app-top-sheet-item"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontWeight: 700,
                                    color: 'var(--진초록)',
                                    padding: '14px 16px',
                                    background: '#f0fdf4',
                                    borderRadius: 12,
                                }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M12 5v14M5 12h14" />
                                </svg>
                                <span>AI 만들기</span>
                            </Link>
                        </div>

                        {로그인함 === false && (
                            <>
                                <div className="app-top-sheet-line" />
                                <Link
                                    href="/login"
                                    className="app-top-sheet-item"
                                    style={{ fontWeight: 800, color: 'var(--진초록)' }}
                                >
                                    로그인하고 클로버 {SIGNUP_CLOVERS}개 받기
                                </Link>
                            </>
                        )}
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
