'use client'

/**
 * 아래 탭바 — 휴대폰에서만 보인다
 *
 * 대표 지시 2026-09-15 = 「탭바 추가해. 다크는 하지말고」 (비글루 참고)
 *
 * 왜 = 위 띠만 있으면 휴대폰에서 손가락이 화면 꼭대기까지 올라가야 한다.
 * 중장년은 한 손으로 쥐고 엄지로 쓰는 경우가 많아서 아래가 훨씬 가깝다.
 * 넓은 화면에서는 위 띠가 이미 다 보여주니 숨긴다.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const 탭 = [
    { href: '/studio', label: '만들기', icon: 만들기아이콘 },
    { href: '/mentors', label: '대화하기', icon: 대화아이콘 },
    { href: '/invite', label: '친구초대', icon: 친구아이콘 },
    { href: '/profile', label: '내 정보', icon: 나아이콘 },
]

export default function BottomTabs() {
    const pathname = usePathname()

    return (
        <nav className="bottom-tabs" aria-label="아래 메뉴">
            {탭.map((t) => {
                const on = pathname === t.href || pathname.startsWith(t.href + '/')
                return (
                    <Link key={t.href} href={t.href} className={on ? 'bottom-tab on' : 'bottom-tab'} aria-current={on ? 'page' : undefined}>
                        <t.icon on={on} />
                        <span>{t.label}</span>
                    </Link>
                )
            })}
        </nav>
    )
}

function 만들기아이콘({ on }: { on: boolean }) {
    const c = on ? 'var(--먹)' : '#9aa39d'
    return (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4.4" stroke={c} strokeWidth="1.9" />
            <path d="M7.6 15.4l3-3.6 2.4 2.6 2-2.2 2.4 3.2" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="14.9" cy="8.9" r="1.5" fill={c} />
        </svg>
    )
}

function 대화아이콘({ on }: { on: boolean }) {
    const c = on ? 'var(--먹)' : '#9aa39d'
    return (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M20.5 11.6c0 3.9-3.8 7-8.5 7-1 0-2-.15-2.9-.42L4 20l1.1-3.3C4.1 15.3 3.5 13.5 3.5 11.6c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7z"
                stroke={c} strokeWidth="1.9" strokeLinejoin="round" />
        </svg>
    )
}

function 친구아이콘({ on }: { on: boolean }) {
    const c = on ? 'var(--먹)' : '#9aa39d'
    return (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="9.2" cy="8.6" r="3.3" stroke={c} strokeWidth="1.9" />
            <path d="M3.4 19.2c0-3 2.6-5 5.8-5s5.8 2 5.8 5" stroke={c} strokeWidth="1.9" strokeLinecap="round" />
            <path d="M17.6 7.2v4.6M15.3 9.5h4.6" stroke={c} strokeWidth="1.9" strokeLinecap="round" />
        </svg>
    )
}

function 나아이콘({ on }: { on: boolean }) {
    const c = on ? 'var(--먹)' : '#9aa39d'
    return (
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="8.4" r="3.6" stroke={c} strokeWidth="1.9" />
            <path d="M4.8 20c0-3.5 3.2-5.7 7.2-5.7s7.2 2.2 7.2 5.7" stroke={c} strokeWidth="1.9" strokeLinecap="round" />
        </svg>
    )
}
