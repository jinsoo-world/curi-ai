'use client'

import { useState } from 'react'

interface InsightCardProps {
    insight: {
        id: string
        title: string
        content: string
        tags: string[]
        mentor_name: string
        created_at: string
    }
}

export default function InsightCard({ insight }: InsightCardProps) {
    const [copied, setCopied] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)

    const handleShare = async () => {
        const shareUrl = `${window.location.origin}/insights/${insight.id}`
        const shareText = `💡 ${insight.title}\n\n${insight.content}\n\n— ${insight.mentor_name} 멘토 | 큐리 AI`

        if (navigator.share) {
            try {
                await navigator.share({
                    title: insight.title,
                    text: shareText,
                    url: shareUrl,
                })
            } catch {
                // 사용자가 공유 취소
            }
        } else {
            // 클립보드 복사 폴백
            await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    return (
        <div
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
                background: 'linear-gradient(135deg, #f0f9ff 0%, #f5f3ff 50%, #fdf2f8 100%)',
                borderRadius: 16,
                padding: '20px 24px',
                margin: '16px 0',
                cursor: 'pointer',
                border: '1px solid rgba(99, 102, 241, 0.1)',
                boxShadow: '0 2px 12px rgba(99, 102, 241, 0.08)',
                transition: 'all 0.2s ease',
                animation: 'slideUp 0.3s ease',
            }}
        >
            {/* 헤더 */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    <span style={{ fontSize: 20 }}>💡</span>
                    <span style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#6366f1',
                        background: 'rgba(99, 102, 241, 0.1)',
                        padding: '3px 8px',
                        borderRadius: 6,
                        letterSpacing: 0.5,
                    }}>
                        🤖 AI 인사이트
                    </span>
                </div>

                <button
                    onClick={(e) => { e.stopPropagation(); handleShare() }}
                    style={{
                        background: 'rgba(99, 102, 241, 0.1)',
                        border: 'none',
                        borderRadius: 8,
                        padding: '6px 12px',
                        fontSize: 13,
                        fontWeight: 500,
                        color: '#6366f1',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                    }}
                >
                    {copied ? '✅ 복사됨' : '🔗 공유'}
                </button>
            </div>

            {/* 제목 */}
            <h4 style={{
                margin: '0 0 8px',
                fontSize: 17,
                fontWeight: 700,
                color: '#18181b',
                lineHeight: 1.4,
            }}>
                {insight.title}
            </h4>

            {/* 내용 */}
            <p style={{
                margin: '0 0 12px',
                fontSize: 14,
                color: '#52525b',
                lineHeight: 1.7,
                overflow: isExpanded ? 'visible' : 'hidden',
                display: isExpanded ? 'block' : '-webkit-box',
                WebkitLineClamp: isExpanded ? undefined : 3,
                WebkitBoxOrient: isExpanded ? undefined : 'vertical' as any,
            }}>
                {insight.content}
            </p>

            {/* 태그 */}
            {insight.tags.length > 0 && (
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginBottom: 8,
                }}>
                    {insight.tags.map((tag, i) => (
                        <span key={i} style={{
                            fontSize: 12,
                            color: '#8b5cf6',
                            background: 'rgba(139, 92, 246, 0.08)',
                            padding: '3px 10px',
                            borderRadius: 12,
                            fontWeight: 500,
                        }}>
                            #{tag}
                        </span>
                    ))}
                </div>
            )}

            {/* 멘토 이름 */}
            <div style={{
                fontSize: 12,
                color: '#a1a1aa',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
            }}>
                <span>— {insight.mentor_name} 멘토</span>
            </div>
        </div>
    )
}
