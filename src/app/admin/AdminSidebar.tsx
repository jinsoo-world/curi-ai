'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const navItems = [
    { href: '/admin/overview', label: '📊 대시보드', id: 'overview' },
    { href: '/admin/users', label: '👥 회원', id: 'users' },
    { href: '/admin/guest-logs', label: '👤 비회원', id: 'guest-logs' },
    { href: '/admin/mentors', label: '🤖 생성된 AI', id: 'mentors' },
    { href: '/admin/conversations', label: '💬 대화 내역', id: 'conversations' },
    { href: '/admin/match-logs', label: '🎯 멘토매칭', id: 'match-logs' },
    { href: '/admin/ebook-logs', label: '📕 전자책', id: 'ebook-logs' },
]

export default function AdminSidebar() {
    const pathname = usePathname()

    return (
        <aside style={{
            width: 240,
            background: '#fff',
            borderRight: '1px solid #e5e7eb',
            padding: '24px 0',
            display: 'flex',
            flexDirection: 'column',
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            zIndex: 50,
        }}>
            <div style={{ padding: '0 20px', marginBottom: 32 }}>
                <Link href="/admin/overview" style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#1a1a2e',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    textDecoration: 'none',
                }}>
                    <Image
                        src="/logo.png"
                        alt="큐리"
                        width={32}
                        height={32}
                        style={{ borderRadius: 8 }}
                    />
                    큐리 어드민
                </Link>
            </div>
            <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {navItems.map(item => {
                    const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
                    return (
                        <Link
                            key={item.id}
                            href={item.href}
                            style={{
                                display: 'block',
                                padding: '12px 20px',
                                color: isActive ? '#4f46e5' : '#64748b',
                                textDecoration: 'none',
                                fontSize: 14,
                                fontWeight: isActive ? 700 : 500,
                                borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
                                background: isActive ? '#f0f0ff' : 'transparent',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {item.label}
                        </Link>
                    )
                })}
            </nav>
            <div style={{ padding: '16px 20px', borderTop: '1px solid #e5e7eb' }}>
                <Link
                    href="/mentors"
                    style={{
                        color: '#94a3b8',
                        fontSize: 12,
                        textDecoration: 'none',
                    }}
                >
                    ← 서비스로 돌아가기
                </Link>
            </div>
        </aside>
    )
}
