'use client'
// 손님(로그인 전) 격자 아래 한 줄. 시연 팀 4명 격자는 OsShell 이 이미 위에서 보여준다(DEMO_TEAM).
// 여기는 「더 보기」 링크 한 줄만 — 리더들이 만든 다른 공개 봇은 봇 마켓에 있다.

import Link from 'next/link'

export default function GuestRoster() {
    return (
        <Link
            href="/os/market"
            role="listitem"
            className="os-row-btn"
            style={{ gridColumn: '1 / -1', textDecoration: 'none', justifyContent: 'center' }}
        >
            리더들이 만든 봇 더 보기 → /os/market
        </Link>
    )
}
