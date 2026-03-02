'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface NotificationItem {
    id: string
    mentor_id: string | null
    message: string
    type: string
    created_at: string
}

export default function NotificationBanner() {
    const [notifications, setNotifications] = useState<NotificationItem[]>([])
    const [dismissed, setDismissed] = useState<Set<string>>(new Set())

    useEffect(() => {
        fetchNotifications()
    }, [])

    async function fetchNotifications() {
        try {
            const res = await fetch('/api/notifications')
            const data = await res.json()
            if (data.notifications?.length) {
                setNotifications(data.notifications)
            }
        } catch {
            // silent
        }
    }

    async function dismissNotification(id: string) {
        setDismissed(prev => new Set([...prev, id]))
        try {
            await fetch('/api/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notificationId: id }),
            })
        } catch {
            // silent
        }
    }

    const visible = notifications.filter(n => !dismissed.has(n.id))
    if (visible.length === 0) return null

    return (
        <div style={{
            maxWidth: 1200,
            margin: '0 auto',
            padding: '0 40px',
        }}>
            {visible.slice(0, 2).map(n => (
                <div
                    key={n.id}
                    style={{
                        background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                        border: '1px solid #bbf7d0',
                        borderRadius: 16,
                        padding: '16px 20px',
                        marginBottom: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        animation: 'slideDown 0.3s ease-out',
                    }}
                >
                    <span style={{ fontSize: 24, flexShrink: 0 }}>💬</span>
                    <div style={{ flex: 1 }}>
                        <p style={{
                            margin: 0,
                            fontSize: 15,
                            color: '#18181b',
                            fontWeight: 500,
                            lineHeight: 1.5,
                        }}>
                            {n.message}
                        </p>
                        {n.mentor_id && (
                            <Link
                                href={`/chat/${n.mentor_id}`}
                                style={{
                                    fontSize: 13,
                                    color: '#16a34a',
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                    marginTop: 4,
                                    display: 'inline-block',
                                }}
                            >
                                대화하러 가기 →
                            </Link>
                        )}
                    </div>
                    <button
                        onClick={() => dismissNotification(n.id)}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: 18,
                            color: '#a1a1aa',
                            padding: 4,
                            flexShrink: 0,
                        }}
                        aria-label="닫기"
                    >
                        ✕
                    </button>
                </div>
            ))}
            <style>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    )
}
