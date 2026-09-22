'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

/**
 * Delphi 스타일 왼쪽 사이드바 (Discover/Chat 전용)
 * 
 * CEO 요구 2026-09-22: Delphi.ai 레이아웃 따라하기
 * - 왼쪽에 고정 사이드바 (desktop)
 * - 모바일에서는 drawer/overlay
 */

interface DiscoverSidebarProps {
    isOpen?: boolean
    onClose?: () => void
}

export default function DiscoverSidebar({ isOpen = false, onClose }: DiscoverSidebarProps) {
    const pathname = usePathname()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    // 모바일에서 메뉴 열렸을 때 ESC로 닫기
    useEffect(() => {
        if (!isOpen) return
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose?.()
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [isOpen, onClose])

    const menuItems = [
        { label: '발견하기', icon: '🔍', href: '/mentors' },
        { label: '채팅', icon: '💬', href: '/chats' },
        { label: '프로필', icon: '👤', href: '/profile' },
    ]

    const isActive = (href: string) => {
        if (href === '/mentors') return pathname === '/mentors' || pathname === '/'
        return pathname.startsWith(href)
    }

    if (!mounted) return null

    return (
        <>
            {/* 모바일 오버레이 배경 */}
            {isOpen && (
                <div
                    className="discover-sidebar-overlay"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}

            {/* 사이드바 본체 */}
            <aside
                className={`discover-sidebar ${isOpen ? 'open' : ''}`}
                role="navigation"
                aria-label="주요 메뉴"
            >
                <div className="discover-sidebar-inner">
                    {/* 메뉴 항목 */}
                    <nav className="discover-sidebar-nav">
                        {menuItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`discover-sidebar-item ${isActive(item.href) ? 'active' : ''}`}
                                onClick={onClose}
                            >
                                <span className="discover-sidebar-icon">{item.icon}</span>
                                <span className="discover-sidebar-label">{item.label}</span>
                            </Link>
                        ))}
                    </nav>

                    {/* 하단 CTA */}
                    <div className="discover-sidebar-footer">
                        <Link
                            href="/creator/create"
                            className="discover-sidebar-create-btn"
                            onClick={onClose}
                        >
                            <span className="discover-sidebar-create-icon">+</span>
                            <span className="discover-sidebar-create-label">AI 만들기</span>
                        </Link>
                    </div>
                </div>
            </aside>

            <style jsx>{`
                .discover-sidebar-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.5);
                    z-index: 998;
                    animation: fadeIn 0.2s ease;
                }

                .discover-sidebar {
                    position: fixed;
                    left: 0;
                    top: 0;
                    bottom: 0;
                    width: 240px;
                    background: #FFFFFF;
                    border-right: 1px solid var(--선);
                    z-index: 999;
                    transition: transform 0.3s ease;
                }

                .discover-sidebar-inner {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    padding: 80px 16px 24px;
                }

                .discover-sidebar-nav {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .discover-sidebar-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 14px 16px;
                    border-radius: 12px;
                    text-decoration: none;
                    color: var(--먹연);
                    font-size: 15px;
                    font-weight: 600;
                    transition: all 0.2s;
                    cursor: pointer;
                }

                .discover-sidebar-item:hover {
                    background: var(--샌드);
                    color: var(--먹);
                }

                .discover-sidebar-item.active {
                    background: #F0FDF4;
                    color: #16A34A;
                }

                .discover-sidebar-icon {
                    font-size: 20px;
                    line-height: 1;
                }

                .discover-sidebar-label {
                    flex: 1;
                }

                .discover-sidebar-footer {
                    margin-top: auto;
                    padding-top: 24px;
                }

                .discover-sidebar-create-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    width: 100%;
                    padding: 16px;
                    background: linear-gradient(135deg, #22C55E, #16A34A);
                    color: #FFFFFF;
                    font-size: 15px;
                    font-weight: 700;
                    border-radius: 12px;
                    text-decoration: none;
                    box-shadow: 0 2px 12px rgba(34, 197, 94, 0.3);
                    transition: all 0.2s;
                }

                .discover-sidebar-create-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 16px rgba(34, 197, 94, 0.4);
                }

                .discover-sidebar-create-icon {
                    font-size: 24px;
                    font-weight: 700;
                    line-height: 1;
                }

                /* 모바일: 왼쪽에서 슬라이드 */
                @media (max-width: 768px) {
                    .discover-sidebar {
                        transform: translateX(-100%);
                    }

                    .discover-sidebar.open {
                        transform: translateX(0);
                    }
                }

                /* 데스크톱: 항상 보임 */
                @media (min-width: 769px) {
                    .discover-sidebar-overlay {
                        display: none;
                    }
                }

                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </>
    )
}
