'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

interface UserProfile {
    display_name: string | null
    avatar_url: string | null
    email: string | null
    role: string | null
    subscription_tier: string | null
}

export default function AppSidebar() {
    const pathname = usePathname()
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [user, setUser] = useState<any>(null)

    const fetchProfile = async (skipCache = false) => {
        // sessionStorage 캐시 체크 (페이지 이동 시 API 호출 스킵)
        if (!skipCache) {
            try {
                const cached = sessionStorage.getItem('sidebar_profile')
                if (cached) {
                    const { profile: cachedProfile, user: cachedUser } = JSON.parse(cached)
                    setProfile(cachedProfile)
                    setUser(cachedUser)
                    return
                }
            } catch {}
        }

        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            setUser(user)
            try {
                const res = await fetch('/api/profile')
                const data = await res.json()
                const p = data.profile ? {
                    display_name: data.profile.display_name,
                    avatar_url: data.profile.avatar_url,
                    email: user.email || null,
                    role: data.profile.role,
                    subscription_tier: data.profile.subscription_tier,
                } : {
                    display_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
                    avatar_url: user.user_metadata?.avatar_url || null,
                    email: user.email || null,
                    role: 'user',
                    subscription_tier: null,
                }
                setProfile(p)
                // 캐시 저장
                try { sessionStorage.setItem('sidebar_profile', JSON.stringify({ profile: p, user: { id: user.id, email: user.email } })) } catch {}
            } catch {
                const p = {
                    display_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
                    avatar_url: user.user_metadata?.avatar_url || null,
                    email: user.email || null,
                    role: 'user',
                    subscription_tier: null,
                }
                setProfile(p)
            }
        }
    }

    useEffect(() => {
        fetchProfile()
        // 프로필 업데이트 시 캐시 무효화 + 사이드바 즉시 반영
        const handleProfileUpdate = (e: StorageEvent) => {
            if (e.key === 'profile_updated') {
                try { sessionStorage.removeItem('sidebar_profile') } catch {}
                fetchProfile(true)
            }
        }
        window.addEventListener('storage', handleProfileUpdate)
        const handleCustomEvent = () => {
            try { sessionStorage.removeItem('sidebar_profile') } catch {}
            fetchProfile(true)
        }
        window.addEventListener('profile_updated', handleCustomEvent)
        return () => {
            window.removeEventListener('storage', handleProfileUpdate)
            window.removeEventListener('profile_updated', handleCustomEvent)
        }
    }, [])

    const isAdmin = profile?.role === 'admin' || profile?.email === 'jin@mission-driven.kr'

    const MENU_ITEMS = [
        { label: '대화하기', href: '/mentors', icon: '💬' },
        { label: '내 대화 목록', href: '/chats', icon: '📋' },
        { type: 'divider' as const },
        { label: '내 AI 만들기', href: '/creator/create', icon: '✨' },
        { label: '내 AI 관리', href: '/creator/manage', icon: '📊' },
        { type: 'divider' as const },
        { label: '미션 보상', href: '/missions', icon: '🍀' },
        { label: '스토어', href: '/store', icon: '🎁' },
        // { label: '멤버십', href: '/pricing', icon: '👑' }, // 무료체험 기간 비공개
        { label: '마이페이지', href: '/profile', icon: '👤' },
    ]

    return (
        <>
            {/* Sidebar — desktop only */}
            <aside
                className="app-sidebar"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: 240,
                    background: '#fff',
                    borderRight: '1px solid #f0f0f0',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 40,
                    overflowY: 'auto',
                }}
            >
                {/* Logo */}
                <Link
                    href="/mentors"
                    style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        textDecoration: 'none',
                        padding: '20px 20px 16px',
                    }}
                >
                    <Image src="/logo.png" alt="큐리 AI" width={32} height={32} style={{ borderRadius: 8 }} />
                    <span style={{
                        fontSize: 18, fontWeight: 800, letterSpacing: '-0.04em',
                        background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>
                        큐리 AI
                    </span>
                </Link>

                {/* Menu */}
                <nav style={{ flex: 1, padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {MENU_ITEMS.map((item, i) => {
                        if ('type' in item && item.type === 'divider') {
                            return (
                                <div
                                    key={`d-${i}`}
                                    style={{
                                        height: 1, background: '#f0f0f0',
                                        margin: '8px 8px',
                                    }}
                                />
                            )
                        }

                        const menuItem = item as { label: string; href: string; icon: string }
                        const isActive = pathname === menuItem.href ||
                            (menuItem.href === '/mentors' && pathname === '/') ||
                            (menuItem.href === '/creator/create' && pathname.startsWith('/creator/create')) ||
                            (menuItem.href === '/creator/manage' && pathname.startsWith('/creator/manage'))

                        return (
                            <Link
                                key={menuItem.href}
                                href={menuItem.href}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 12px',
                                    borderRadius: 10,
                                    textDecoration: 'none',
                                    fontSize: 15,
                                    fontWeight: isActive ? 700 : 500,
                                    color: isActive ? '#16a34a' : '#52525b',
                                    background: isActive ? '#f0fdf4' : 'transparent',
                                    transition: 'all 150ms ease',
                                }}
                            >
                                <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>
                                    {menuItem.icon}
                                </span>
                                {menuItem.label}
                            </Link>
                        )
                    })}

                    {/* Admin link — only for admin role */}
                    {isAdmin && (
                        <>
                            <div style={{ height: 1, background: '#f0f0f0', margin: '8px 8px' }} />
                            <Link
                                href="/admin"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 12px',
                                    borderRadius: 10,
                                    textDecoration: 'none',
                                    fontSize: 15,
                                    fontWeight: pathname.startsWith('/admin') ? 700 : 600,
                                    color: '#dc2626',
                                    background: pathname.startsWith('/admin') ? '#fef2f2' : 'transparent',
                                    transition: 'all 150ms ease',
                                }}
                            >
                                <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>🔧</span>
                                어드민 관리
                            </Link>
                        </>
                    )}
                </nav>

                {/* Bottom — User profile + badge */}
                <div style={{ padding: '12px', borderTop: '1px solid #f0f0f0' }}>
                    {(profile || user) ? (
                        <Link
                            href="/profile"
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                textDecoration: 'none',
                                padding: '8px',
                                borderRadius: 10,
                                transition: 'background 150ms',
                            }}
                        >
                            {(profile?.avatar_url || user?.user_metadata?.avatar_url) ? (
                                <img
                                    src={profile?.avatar_url || user?.user_metadata?.avatar_url}
                                    alt="프로필"
                                    style={{
                                        width: 36, height: 36,
                                        borderRadius: '50%',
                                        objectFit: 'cover',
                                        border: '2px solid #dcfce7',
                                    }}
                                />
                            ) : (
                                <div style={{
                                    width: 36, height: 36,
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontSize: 16, fontWeight: 700,
                                }}>
                                    {(profile?.display_name || user?.user_metadata?.name || '?')[0]}
                                </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: 14, fontWeight: 600, color: '#18181b',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {profile?.display_name || user?.user_metadata?.name || '사용자'}
                                </div>
                                <div style={{
                                    fontSize: 11, fontWeight: 600,
                                    color: profile?.subscription_tier === 'premium' ? '#f59e0b'
                                        : profile?.subscription_tier === 'free' ? '#3b82f6'
                                        : profile?.subscription_tier === 'free_trial' ? '#16a34a'
                                        : '#9ca3af',
                                }}>
                                    {profile?.subscription_tier === 'premium' ? '✨ Premium'
                                        : profile?.subscription_tier === 'pro' ? '🚀 Pro'
                                        : profile?.subscription_tier === 'free_trial' ? '🎁 무료체험'
                                        : '📋 Free'}
                                </div>
                            </div>
                        </Link>
                    ) : (
                        <Link
                            href="/login"
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                textDecoration: 'none',
                                padding: '8px',
                                borderRadius: 10,
                                transition: 'background 150ms',
                            }}
                        >
                            <div style={{
                                width: 36, height: 36,
                                borderRadius: '50%',
                                background: '#f0f0f0',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#9ca3af', fontSize: 16,
                            }}>
                                👤
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b' }}>
                                    마이페이지
                                </div>
                                <div style={{ fontSize: 11, color: '#9ca3af' }}>
                                    로그인하기
                                </div>
                            </div>
                        </Link>
                    )}
                </div>
            </aside>

            {/* Mobile Top Header — 큐리AI 로고 */}
            <div
                className="app-mobile-header"
                style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0,
                    height: 48,
                    background: 'rgba(255,255,255,0.97)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderBottom: '1px solid #f0f0f0',
                    display: 'none',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8,
                    zIndex: 41,
                }}
            >
                <Image src="/logo.png" alt="큐리 AI" width={26} height={26} style={{ borderRadius: 6 }} />
                <span style={{
                    fontSize: 16, fontWeight: 800, letterSpacing: '-0.04em',
                    background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                    큐리 AI
                </span>
            </div>

            {/* Mobile Bottom Nav — 토스 스타일 */}
            <nav
                className="app-mobile-nav"
                style={{
                    position: 'fixed',
                    bottom: 0, left: 0, right: 0,
                    background: '#fff',
                    borderTop: '1px solid #f2f3f4',
                    display: 'none', /* shown via CSS media query */
                    justifyContent: 'space-around',
                    alignItems: 'center',
                    padding: '8px 0 max(8px, env(safe-area-inset-bottom))',
                    zIndex: 40,
                }}
            >
                {[
                    {
                        label: '대화',
                        href: '/mentors',
                        icon: (active: boolean) => (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                {active ? (
                                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" fill="#191F28"/>
                                ) : (
                                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" fill="#B0B8C1"/>
                                )}
                            </svg>
                        ),
                    },
                    {
                        label: '목록',
                        href: '/chats',
                        icon: (active: boolean) => (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                {active ? (
                                    <>
                                        <rect x="3" y="4" width="18" height="4" rx="1" fill="#191F28"/>
                                        <rect x="3" y="10" width="18" height="4" rx="1" fill="#191F28"/>
                                        <rect x="3" y="16" width="12" height="4" rx="1" fill="#191F28"/>
                                    </>
                                ) : (
                                    <>
                                        <rect x="3" y="4.5" width="18" height="3" rx="1" stroke="#B0B8C1" strokeWidth="1.5" fill="none"/>
                                        <rect x="3" y="10.5" width="18" height="3" rx="1" stroke="#B0B8C1" strokeWidth="1.5" fill="none"/>
                                        <rect x="3" y="16.5" width="12" height="3" rx="1" stroke="#B0B8C1" strokeWidth="1.5" fill="none"/>
                                    </>
                                )}
                            </svg>
                        ),
                    },
                    {
                        label: 'AI 제작',
                        href: '/creator/manage',
                        icon: (active: boolean) => (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                {active ? (
                                    <path d="M19.36 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.64-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" fill="#191F28"/>
                                ) : (
                                    <>
                                        <path d="M12 6.5L7 11.5h3v4h4v-4h3l-5-5z" stroke="#B0B8C1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                        <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" stroke="#B0B8C1" strokeWidth="1.5" fill="none"/>
                                    </>
                                )}
                            </svg>
                        ),
                    },
                    {
                        label: '미션보상',
                        href: '/missions',
                        icon: (active: boolean) => (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                {active ? (
                                    <path d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35L12 4l-.5-.65C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 12 7.4 15.38 12 17 10.83 14.92 8H20v6z" fill="#191F28"/>
                                ) : (
                                    <path d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35L12 4l-.5-.65C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 12 7.4 15.38 12 17 10.83 14.92 8H20v6z" stroke="#B0B8C1" strokeWidth="0.5" fill="#B0B8C1"/>
                                )}
                            </svg>
                        ),
                    },
                    {
                        label: '마이페이지',
                        href: '/profile',
                        icon: (active: boolean) => (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                {active ? (
                                    <>
                                        <circle cx="12" cy="8" r="4" fill="#191F28"/>
                                        <path d="M12 14c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z" fill="#191F28"/>
                                    </>
                                ) : (
                                    <>
                                        <circle cx="12" cy="8" r="3.25" stroke="#B0B8C1" strokeWidth="1.5"/>
                                        <path d="M12 14c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z" stroke="#B0B8C1" strokeWidth="1.5" fill="none"/>
                                    </>
                                )}
                            </svg>
                        ),
                    },
                ].map(item => {
                    const isActive = pathname === item.href ||
                        (item.href === '/mentors' && pathname === '/') ||
                        (item.href === '/creator/manage' && pathname.startsWith('/creator'))
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            style={{
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', gap: 2,
                                textDecoration: 'none',
                                fontSize: 11,
                                fontWeight: isActive ? 700 : 400,
                                color: isActive ? '#191F28' : '#B0B8C1',
                                padding: '2px 0',
                                minWidth: 56,
                                transition: 'color 200ms ease',
                            }}
                        >
                            <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {item.icon(isActive)}
                            </div>
                            <span style={{ letterSpacing: '-0.02em' }}>{item.label}</span>
                        </Link>
                    )
                })}
            </nav>

            {/* ═══ 우측 하단 플로팅 버튼 ═══ */}
            <div
                className="floating-action-btns"
                style={{
                    position: 'fixed',
                    right: 20,
                    bottom: 24,
                    zIndex: 50,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    alignItems: 'flex-end',
                }}
            >
                {/* 커뮤니티 — 카카오 오픈채팅 */}
                <a
                    href="https://open.kakao.com/me/500won"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                        width: 48, height: 48,
                        borderRadius: '50%',
                        background: '#FEE500',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
                        cursor: 'pointer',
                        transition: 'transform 150ms, box-shadow 150ms',
                        textDecoration: 'none',
                        position: 'relative',
                    }}
                    title="커뮤니티"
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.2)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.15)' }}
                >
                    {/* 카카오톡 말풍선 아이콘 */}
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M12 3C6.48 3 2 6.58 2 10.94c0 2.8 1.86 5.27 4.66 6.67-.15.55-.95 3.47-.98 3.67 0 0-.02.17.09.24.11.06.23.01.23.01.3-.04 3.54-2.32 4.1-2.72.6.09 1.23.13 1.9.13 5.52 0 10-3.58 10-7.95S17.52 3 12 3z" fill="#3C1E1E"/>
                    </svg>
                </a>

                {/* AI 만들기 (+) */}
                <Link
                    href="/creator/create"
                    style={{
                        width: 52, height: 52,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(34,197,94,0.35)',
                        cursor: 'pointer',
                        transition: 'transform 150ms, box-shadow 150ms',
                        textDecoration: 'none',
                    }}
                    title="AI 만들기"
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(34,197,94,0.45)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(34,197,94,0.35)' }}
                >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </Link>
            </div>

            {/* CSS for responsive sidebar/mobile-nav */}
            <style>{`
                @media (min-width: 769px) {
                    .app-sidebar { display: flex !important; }
                    .app-mobile-nav { display: none !important; }
                    .app-mobile-header { display: none !important; }
                }
                @media (max-width: 768px) {
                    .app-sidebar { display: none !important; }
                    .app-mobile-nav { display: flex !important; }
                    .app-mobile-header { display: flex !important; }
                    .floating-action-btns { bottom: 130px !important; right: 14px !important; }
                }
            `}</style>
        </>
    )
}
