'use client'

/**
 * 아래 고정 메뉴 — 렌트리에서 가져온 것 (2026-09-16)
 *
 * 대표 지시 = 「렌트리 참고해서 큐리 AI 개선해줘」
 *
 * 렌트리는 모든 화면 아래에 다섯 칸(홈·인터넷·견적보관함·채팅·더보기)을 늘 띄워둔다.
 * 우리는 좁은 화면에서 메뉴가 전부 햄버거 안에만 있었다(.app-top-nav 는 900px 미만에서 숨는다).
 * 중장년은 햄버거를 잘 안 연다 = 한 번 들어온 사람이 다음에 갈 곳을 못 찾는다.
 *
 * 숨기는 곳 = 사진 만드는 중·대화 중·관리자·결제창. 렌트리도 채팅방 안에서는 이 띠를 걷는다.
 */
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type 칸 = { label: string; href: string; icon: React.ReactNode; match: (p: string) => boolean }

/** 맨 끝 「더보기」 — 렌트리처럼 오른쪽 서랍을 연다. AppSidebar 가 이 신호를 듣는다. */
const 더보기아이콘 = (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" />
    </svg>
)

const 선 = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

const 칸들: 칸[] = [
    {
        label: '발견', href: '/mentors',
        match: (p) => p === '/mentors' || p === '/',
        icon: (<svg width="22" height="22" viewBox="0 0 24 24" {...선}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></svg>),
    },
    {
        label: 'AI', href: '/creator/create',
        match: (p) => p.startsWith('/creator') || p.startsWith('/studio'),
        icon: (<svg width="22" height="22" viewBox="0 0 24 24" {...선}><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="6" r="1.5" /><circle cx="12" cy="18" r="1.5" /><circle cx="6" cy="9" r="1.5" /><circle cx="18" cy="9" r="1.5" /><circle cx="6" cy="15" r="1.5" /><circle cx="18" cy="15" r="1.5" /></svg>),
    },
    {
        label: '사진', href: '/tools',
        match: (p) => p.startsWith('/tools'),
        icon: (<svg width="22" height="22" viewBox="0 0 24 24" {...선}><rect x="3" y="5" width="18" height="15" rx="3" /><circle cx="12" cy="12.5" r="3.5" /><path d="M8 5l1.2-2h5.6L16 5" /></svg>),
    },
    {
        label: '채팅', href: '/chats',
        match: (p) => p.startsWith('/chats') || p.startsWith('/chat/'),
        icon: (<svg width="22" height="22" viewBox="0 0 24 24" {...선}><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" /></svg>),
    },
]

/** 이 띠를 걷는 곳 — 손이 바쁜 화면 */
const 숨김 = ['/tools/teacher-photo', '/tools/id-photo', '/tools/insta-profile', '/tools/actor-photo', '/tools/enhance', '/tools/thumbnail', '/chat/', '/coach/', '/admin', '/login', '/billing', '/charge', '/creator/create', '/creator/edit', '/studio/']

export default function BottomTabs() {
    const pathname = usePathname() || '/'
    if (숨김.some((s) => pathname.startsWith(s))) return null

    return (
        <>
        <nav className="btm-tabs" aria-label="주요 메뉴">
            {칸들.map((c) => {
                const 지금 = c.match(pathname)
                return (
                    <Link
                        key={c.href}
                        href={c.href}
                        className={지금 ? 'btm-tab on' : 'btm-tab'}
                        aria-current={지금 ? 'page' : undefined}
                    >
                        {c.icon}
                        <span>{c.label}</span>
                    </Link>
                )
            })}

            <button
                type="button"
                className="btm-tab"
                onClick={() => window.dispatchEvent(new Event('curi:open-menu'))}
                aria-label="더보기 메뉴 열기"
            >
                {더보기아이콘}
                <span>더보기</span>
            </button>
        </nav>
                        <style>{`
                .btm-tabs {
                    position: fixed; left: 0; right: 0; bottom: 0; z-index: 60;
                    display: flex;
                    background: rgba(255,255,255,0.96);
                    -webkit-backdrop-filter: saturate(180%) blur(8px);
                    backdrop-filter: saturate(180%) blur(8px);
                    border-top: 1px solid var(--선, #E5E7EB);
                    padding-bottom: env(safe-area-inset-bottom, 0px);
                }
                .btm-tab {
                    appearance: none; border: 0; background: transparent; cursor: pointer; font-family: inherit;
                    flex: 1 1 0;
                    display: flex; flex-direction: column;
                    align-items: center; justify-content: center; gap: 3px;
                    padding: 9px 2px 8px;
                    text-decoration: none;
                    color: var(--먹연, #5C6660);
                    font-size: 11.5px; font-weight: 700; letter-spacing: -0.03em;
                    min-height: 56px;
                    -webkit-tap-highlight-color: transparent;
                }
                .btm-tab.on { color: var(--진초록, #0B4A2A); }
                .btm-tab.on svg { stroke-width: 2.2; }
                @media (min-width: 900px) { .btm-tabs { display: none; } }
                @media (max-width: 899px) { body { padding-bottom: 60px; } }
            `}</style>
        </>
    )
}
