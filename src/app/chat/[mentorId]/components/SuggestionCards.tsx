'use client'

import { useState } from 'react'

interface SuggestionCardsProps {
    suggestions: string[]
    onSelect: (suggestion: string) => void
    /** 'welcome' = 초기 인사 아래 세로 배열, 'inline' = 대화 중 가로 칩 */
    variant: 'welcome' | 'inline'
    isLoading?: boolean
}

export default function SuggestionCards({
    suggestions,
    onSelect,
    variant,
    isLoading,
}: SuggestionCardsProps) {
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

    // 로딩 스켈레톤
    if (isLoading) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: variant === 'welcome' ? 'column' : 'row',
                gap: variant === 'welcome' ? 10 : 8,
                marginTop: variant === 'welcome' ? 24 : 0,
                width: '100%',
                maxWidth: variant === 'welcome' ? 560 : undefined,
                flexWrap: variant === 'inline' ? 'wrap' : undefined,
            }}>
                {[1, 2, 3].map(i => (
                    <div
                        key={i}
                        style={{
                            height: variant === 'welcome' ? 48 : 34,
                            width: variant === 'welcome' ? '100%' : `${90 + i * 20}px`,
                            borderRadius: 24,
                            background: 'linear-gradient(90deg, #f1f5f9 25%, #f8fafc 50%, #f1f5f9 75%)',
                            backgroundSize: '200% 100%',
                            animation: `shimmer 1.5s ease-in-out infinite ${i * 0.15}s`,
                        }}
                    />
                ))}
                <style>{`
                    @keyframes shimmer {
                        0% { background-position: 200% 0; }
                        100% { background-position: -200% 0; }
                    }
                `}</style>
            </div>
        )
    }

    if (suggestions.length === 0) return null

    /* ── Welcome 카드 — 제미나이 스타일 둥근 카드 ── */
    if (variant === 'welcome') {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                marginTop: 24,
                width: '100%',
                maxWidth: 560,
            }}>
                {suggestions.map((q, i) => {
                    const isHovered = hoveredIndex === i
                    return (
                        <button
                            key={i}
                            onClick={() => onSelect(q)}
                            onMouseEnter={() => setHoveredIndex(i)}
                            onMouseLeave={() => setHoveredIndex(null)}
                            style={{
                                background: isHovered ? '#f0fdf4' : '#fff',
                                border: `1px solid ${isHovered ? '#bbf7d0' : '#e2e8f0'}`,
                                borderRadius: 16,
                                padding: '13px 18px',
                                fontSize: 14,
                                color: '#334155',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                fontWeight: 500,
                                lineHeight: 1.5,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
                                boxShadow: isHovered
                                    ? '0 4px 16px rgba(34,197,94,0.08)'
                                    : '0 1px 3px rgba(0,0,0,0.03)',
                            }}
                        >
                            {/* 아이콘 → 가벼운 서클 */}
                            <span style={{
                                width: 32,
                                height: 32,
                                borderRadius: 10,
                                background: isHovered ? '#dcfce7' : '#f1f5f9',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                transition: 'background 0.2s',
                            }}>
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={isHovered ? '#16a34a' : '#94a3b8'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke 0.2s' }}>
                                    <path d="M6 3L11 8L6 13" />
                                </svg>
                            </span>
                            <span>{q}</span>
                        </button>
                    )
                })}
            </div>
        )
    }

    /* ── Inline 칩 — 대화 중 추천 ── */
    return (
        <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            animation: 'slideUp 0.3s ease-out',
        }}>
            {suggestions.map((q, i) => {
                const isHovered = hoveredIndex === i
                return (
                    <button
                        key={i}
                        onClick={() => onSelect(q)}
                        onMouseEnter={() => setHoveredIndex(i)}
                        onMouseLeave={() => setHoveredIndex(null)}
                        style={{
                            background: isHovered ? '#f0fdf4' : '#fff',
                            border: `1px solid ${isHovered ? '#bbf7d0' : '#e2e8f0'}`,
                            borderRadius: 20,
                            padding: '8px 16px',
                            fontSize: 13,
                            color: isHovered ? '#15803d' : '#64748b',
                            cursor: 'pointer',
                            fontWeight: 500,
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
                            boxShadow: isHovered ? '0 2px 8px rgba(34,197,94,0.08)' : 'none',
                        }}
                    >
                        {q}
                    </button>
                )
            })}
            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    )
}
