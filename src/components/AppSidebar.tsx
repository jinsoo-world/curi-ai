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

    useEffect(() => {
        const supabase = createClient()
        const fetchProfile = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data } = await supabase
                    .from('users')
                    .select('display_name, avatar_url, role, subscription_tier')
                    .eq('id', user.id)
                    .single()
                if (data) setProfile(data)
            }
        }
        fetchProfile()
    }, [])

    const isAdmin = profile?.role === 'admin'

    const MENU_ITEMS = [
        { label: '대화하기', href: '/mentors', icon: '💬' },
        { label: '내 대화 목록', href: '/chats', icon: '📋' },
        { type: 'divider' as const },
        { label: '내 AI 만들기', href: '/creator/create', icon: '✨' },
        { label: '내 AI 관리', href: '/creator/manage', icon: '📊' },
        { type: 'divider' as const },
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
                    {profile ? (
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
                            {profile.avatar_url ? (
                                <img
                                    src={profile.avatar_url}
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
                                    {(profile.display_name || '?')[0]}
                                </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: 14, fontWeight: 600, color: '#18181b',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {profile.display_name || '사용자'}
                                </div>
                                <div style={{
                                    fontSize: 11, fontWeight: 600,
                                    color: profile.subscription_tier === 'premium' ? '#f59e0b' : '#16a34a',
                                }}>
                                    {profile.subscription_tier === 'premium' ? '✨ 프리미엄' : '🎁 무료 체험 중'}
                                </div>
                            </div>
                        </Link>
                    ) : (
                        <div style={{
                            padding: '12px',
                            background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)',
                            borderRadius: 12,
                            border: '1px solid #dcfce7',
                        }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>
                                🎁 무료 체험
                            </div>
                            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
                                AI를 무료로 체험해보세요
                            </div>
                        </div>
                    )}
                </div>
            </aside>

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
                    { label: '멤버십', href: '/pricing', icon: '👑' },
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

            {/* CSS for responsive sidebar/mobile-nav */}
            <style>{`
                @media (min-width: 769px) {
                    .app-sidebar { display: flex !important; }
                    .app-mobile-nav { display: none !important; }
                }
                @media (max-width: 768px) {
                    .app-sidebar { display: none !important; }
                    .app-mobile-nav { display: flex !important; }
                }
            `}</style>
        </>
    )
}
