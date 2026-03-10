'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

interface UserProfile {
    display_name: string | null
    avatar_url: string | null
    role: string | null
    subscription_tier: string | null
}

export default function AppSidebar() {
    const pathname = usePathname()
    const [profile, setProfile] = useState<UserProfile | null>(null)
    const [user, setUser] = useState<any>(null)

    const fetchProfile = async () => {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            setUser(user)
            try {
                const res = await fetch('/api/profile')
                const data = await res.json()
                if (data.profile) {
                    setProfile({
                        display_name: data.profile.display_name,
                        avatar_url: data.profile.avatar_url,
                        role: data.profile.role,
                        subscription_tier: data.profile.subscription_tier,
                    })
                } else {
                    // API에 프로필 없으면 Google 메타데이터 fallback
                    setProfile({
                        display_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
                        avatar_url: user.user_metadata?.avatar_url || null,
                        role: 'user',
                        subscription_tier: null,
                    })
                }
            } catch {
                // API 실패 시 Google 메타데이터 fallback
                setProfile({
                    display_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
                    avatar_url: user.user_metadata?.avatar_url || null,
                    role: 'user',
                    subscription_tier: null,
                })
            }
        }
    }

    useEffect(() => {
        fetchProfile()
        // 프로필 업데이트 시 사이드바 즉시 반영 (storage event)
        const handleProfileUpdate = (e: StorageEvent) => {
            if (e.key === 'profile_updated') fetchProfile()
        }
        window.addEventListener('storage', handleProfileUpdate)
        // 같은 탭에서도 반영
        const handleCustomEvent = () => fetchProfile()
        window.addEventListener('profile_updated', handleCustomEvent)
        return () => {
            window.removeEventListener('storage', handleProfileUpdate)
            window.removeEventListener('profile_updated', handleCustomEvent)
        }
    }, [])

    const isAdmin = profile?.role === 'admin'

    const MENU_ITEMS = [
        { label: '대화하기', href: '/mentors', icon: '💬' },
        { label: '내 대화 목록', href: '/chats', icon: '📋' },
        { type: 'divider' as const },
        { label: '내 AI 만들기', href: '/creator/create', icon: '✨' },
        { label: '내 AI 관리', href: '/creator/manage', icon: '📊' },
        { type: 'divider' as const },
        { label: '미션', href: '/missions', icon: '🍀' },
        { label: '스토어', href: '/store', icon: '🎁' },
        { label: '멤버십', href: '/pricing', icon: '👑' },
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
                                    {profile?.subscription_tier === 'premium' ? '✨ 프리미엄'
                                        : profile?.subscription_tier === 'free' ? '🎫 프리'
                                        : profile?.subscription_tier === 'free_trial' ? '🎁 무료 체험 중'
                                        : '기본'}
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

            {/* Mobile Bottom Nav */}
            <nav
                className="app-mobile-nav"
                style={{
                    position: 'fixed',
                    bottom: 0, left: 0, right: 0,
                    background: 'rgba(255,255,255,0.97)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderTop: '1px solid #f0f0f0',
                    display: 'none', /* shown via CSS media query */
                    justifyContent: 'space-around',
                    alignItems: 'center',
                    padding: '6px 0 max(6px, env(safe-area-inset-bottom))',
                    zIndex: 40,
                }}
            >
                {[
                    { label: 'AI', href: '/mentors', icon: '💬' },
                    { label: '대화', href: '/chats', icon: '📋' },
                    { label: 'AI만들기', href: '/creator/create', icon: '✨' },
                    { label: '미션', href: '/missions', icon: '🍀' },
                    { label: 'MY', href: '/profile', icon: '👤' },
                ].map(item => {
                    const isActive = pathname === item.href ||
                        (item.href === '/mentors' && pathname === '/')
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            style={{
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', gap: 2,
                                textDecoration: 'none',
                                fontSize: 10, fontWeight: isActive ? 700 : 500,
                                color: isActive ? '#16a34a' : '#9ca3af',
                                padding: '4px 8px',
                                transition: 'color 150ms',
                            }}
                        >
                            <span style={{ fontSize: 20 }}>{item.icon}</span>
                            {item.label}
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
                    href="https://open.kakao.com/o/gCuriAI"
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
                    .floating-action-btns { bottom: 72px !important; right: 14px !important; }
                }
            `}</style>
        </>
    )
}
