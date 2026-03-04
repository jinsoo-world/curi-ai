'use client'

import { useState } from 'react'

interface SuggestionCardsProps {
    suggestions: string[]
    onSelect: (suggestion: string) => void
    /** 'welcome' = 초기 인사 아래 세로 배열, 'inline' = 대화 중 가로 칩 */
    variant: 'welcome' | 'inline'
    isLoading?: boolean
}

const SUGGESTION_ICONS = ['💡', '🎯', '🚀', '✨', '📌']

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
                marginTop: variant === 'welcome' ? 20 : 0,
                width: '100%',
                maxWidth: variant === 'welcome' ? 600 : undefined,
                flexWrap: variant === 'inline' ? 'wrap' : undefined,
                paddingLeft: variant === 'inline' ? 48 : undefined,
            }}>
                {[1, 2, 3].map(i => (
                    <div
                        key={i}
                        style={{
                            height: variant === 'welcome' ? 52 : 36,
                            width: variant === 'welcome' ? '100%' : `${100 + i * 20}px`,
                            borderRadius: variant === 'welcome' ? 16 : 20,
                            background: 'linear-gradient(90deg, #f0f0f0 25%, #f8f8f8 50%, #f0f0f0 75%)',
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

    if (variant === 'welcome') {
        return (
            <div className="suggestion-welcome" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                marginTop: 20,
                width: '100%',
                maxWidth: 600,
            }}>
                <p style={{
                    margin: 0,
                    fontSize: 13,
                    color: '#a1a1aa',
                    fontWeight: 500,
                    letterSpacing: '0.02em',
                }}>
                    이런 걸 물어보세요
                </p>
                {suggestions.map((q, i) => {
                    const isHovered = hoveredIndex === i
                    return (
                        <button
                            key={i}
                            onClick={() => onSelect(q)}
                            onMouseEnter={() => setHoveredIndex(i)}
                            onMouseLeave={() => setHoveredIndex(null)}
                            style={{
                                background: isHovered
                                    ? 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)'
                                    : '#fff',
                                border: `1.5px solid ${isHovered ? '#86efac' : '#e4e4e7'}`,
                                borderRadius: 16,
                                padding: '14px 18px',
                                fontSize: 15,
                                color: '#18181b',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                fontWeight: 500,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
                                boxShadow: isHovered
                                    ? '0 4px 12px rgba(34,197,94,0.12)'
                                    : '0 1px 3px rgba(0,0,0,0.04)',
                            }}
                        >
                            <span style={{
                                fontSize: 18,
                                width: 32,
                                height: 32,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: isHovered ? '#dcfce7' : '#f4f4f5',
                                borderRadius: 10,
                                transition: 'background 0.2s',
                                flexShrink: 0,
                            }}>
                                {SUGGESTION_ICONS[i % SUGGESTION_ICONS.length]}
                            </span>
                            <span style={{ lineHeight: 1.4 }}>{q}</span>
                        </button>
                    )
                })}
            </div>
        )
    }

    // inline variant — 대화 중 추천 질문 칩
    return (
        <div className="suggestion-inline" style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            paddingLeft: 48,
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
                            border: `1px solid ${isHovered ? '#86efac' : '#e4e4e7'}`,
                            borderRadius: 20,
                            padding: '8px 16px',
                            fontSize: 13,
                            color: isHovered ? '#15803d' : '#16a34a',
                            cursor: 'pointer',
                            fontWeight: 500,
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            transform: isHovered ? 'translateY(-1px)' : 'translateY(0)',
                            boxShadow: isHovered
                                ? '0 2px 8px rgba(34,197,94,0.1)'
                                : 'none',
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
