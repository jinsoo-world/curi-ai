'use client'
// /home 위 메뉴: 로고(/home), 가격 안내, 내 봇 팀, 더보기 (봇 마켓, 사진 도구, 도움말, 로그인 또는 내 정보)
// 친구 초대는 추천 보상이 정해질 때까지(D2) 메뉴에서 뺐다. /invite 화면 자체는 남아 있다

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { HOME_COPY } from '@/domains/home/copy'

export default function HomeTopBar() {
    const [open, setOpen] = useState(false)
    const [signedIn, setSignedIn] = useState(false)
    const box = useRef<HTMLDivElement>(null)

    useEffect(() => {
        createClient().auth.getSession().then(({ data }) => setSignedIn(!!data.session)).catch(() => {})
    }, [])

    useEffect(() => {
        if (!open) return
        const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', close)
        document.addEventListener('keydown', esc)
        return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
    }, [open])

    const n = HOME_COPY.nav
    return (
        <header className="hm-top">
            <div className="hm-top-in">
                <Link href="/home" className="hm-logo" aria-label="큐리AI 홈">
                    <Image src="/icons/curi-192.png" alt="" width={30} height={30} style={{ borderRadius: 9 }} />
                    <span>큐리AI</span>
                </Link>
                <nav className="hm-nav" aria-label="메뉴">
                    <Link href="/os/charge">{n.pricing}</Link>
                    <Link href="/os">{n.team}</Link>
                    <div className="hm-more" ref={box}>
                        <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)}>{n.more}</button>
                        {open && (
                            <div className="hm-more-menu" role="menu">
                                <Link role="menuitem" href="/mentors" onClick={() => setOpen(false)}>{n.market}</Link>
                                <Link role="menuitem" href="/studio" onClick={() => setOpen(false)}>{n.photo}</Link>
                                <a role="menuitem" href="#faq" onClick={() => setOpen(false)}>{n.help}</a>
                                {signedIn
                                    ? <Link role="menuitem" href="/profile" onClick={() => setOpen(false)}>{n.me}</Link>
                                    : <Link role="menuitem" href="/login?next=%2Fos" onClick={() => setOpen(false)}>{n.login}</Link>}
                            </div>
                        )}
                    </div>
                </nav>
            </div>
        </header>
    )
}
