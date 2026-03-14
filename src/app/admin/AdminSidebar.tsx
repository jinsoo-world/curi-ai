'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navItems = [
    { href: '/admin/overview', label: '📊 Overview', id: 'overview' },
    { href: '/admin/users', label: '👥 Users', id: 'users' },
    { href: '/admin/mentors', label: '🤖 Mentors', id: 'mentors' },
    { href: '/admin/conversations', label: '💬 Conversations', id: 'conversations' },
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
                <h1 style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: '#1a1a2e',
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    <span style={{
                        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        borderRadius: 8,
                        width: 32,
                        height: 32,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                    }}>🔮</span>
                    큐리 Admin
                </h1>
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
