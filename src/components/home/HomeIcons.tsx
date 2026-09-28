// /home 곳 아이콘 (그림 파일 없이 SVG). 각 곳의 알아보기 쉬운 표시를 단순하게 그렸다
import type { ReactNode } from 'react'
import type { HomeLinkPlatform } from '@/domains/home/link-chip'

export type HomeIconKind = HomeLinkPlatform | 'file' | 'link'

const Mark = ({ bg, children, r = 5 }: { bg: string; children: ReactNode; r?: number }) => (
    <><rect width="20" height="20" rx={r} fill={bg} />{children}</>
)
const Letter = ({ t, size = 12, fill = '#fff' }: { t: string; size?: number; fill?: string }) => (
    <text x="10" y="10" dy="0.36em" textAnchor="middle" fontSize={size} fontWeight="800" fill={fill} fontFamily="Arial, Helvetica, sans-serif">{t}</text>
)

export function HomeSourceIcon({ kind, size = 20 }: { kind: HomeIconKind; size?: number }) {
    const common = { width: size, height: size, viewBox: '0 0 20 20', 'aria-hidden': true, focusable: false } as const
    switch (kind) {
        case 'youtube':
            return <svg {...common}><Mark bg="#FF0000"><path d="M8 6.5v7l6-3.5z" fill="#fff" /></Mark></svg>
        case 'instagram':
            return (
                <svg {...common}>
                    <defs>
                        <linearGradient id="hm-ig" x1="0" y1="20" x2="20" y2="0" gradientUnits="userSpaceOnUse">
                            <stop offset="0" stopColor="#FEDA75" /><stop offset=".35" stopColor="#FA7E1E" /><stop offset=".6" stopColor="#D62976" /><stop offset="1" stopColor="#4F5BD5" />
                        </linearGradient>
                    </defs>
                    <rect width="20" height="20" rx="6" fill="url(#hm-ig)" />
                    <rect x="4.5" y="4.5" width="11" height="11" rx="3.5" fill="none" stroke="#fff" strokeWidth="1.6" />
                    <circle cx="10" cy="10" r="2.6" fill="none" stroke="#fff" strokeWidth="1.6" />
                    <circle cx="13.4" cy="6.6" r=".9" fill="#fff" />
                </svg>
            )
        case 'threads':
            return <svg {...common}><Mark bg="#111" r={6}><Letter t="@" size={13} /></Mark></svg>
        case 'blog':
            return <svg {...common}><Mark bg="#03C75A"><Letter t="b" size={13} /></Mark></svg>
        case 'tistory':
            return <svg {...common}><Mark bg="#FF5A4A" r={10}><Letter t="T" size={11} /></Mark></svg>
        case 'brunch':
            return <svg {...common}><Mark bg="#1D1D1D" r={10}><Letter t="b" size={12} /></Mark></svg>
        case 'shop':
            return (
                <svg {...common}><Mark bg="#FFF4E5">
                    <path d="M5.5 7.5h9l-.8 8h-7.4z" fill="none" stroke="#F08C00" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M7.8 7.5V6.6a2.2 2.2 0 0 1 4.4 0v.9" fill="none" stroke="#F08C00" strokeWidth="1.5" strokeLinecap="round" />
                </Mark></svg>
            )
        case 'file':
            return (
                <svg {...common}><Mark bg="#EAF2FF">
                    <path d="M7 4.5h4.2L14 7.3v8.2H7z" fill="none" stroke="#2F6BFF" strokeWidth="1.5" strokeLinejoin="round" />
                    <path d="M11 4.7v2.8h2.8M8.8 10.5h3.4M8.8 12.8h3.4" fill="none" stroke="#2F6BFF" strokeWidth="1.3" strokeLinecap="round" />
                </Mark></svg>
            )
        case 'link':
            return (
                <svg {...common}>
                    <path d="M8.6 11.4a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-.9.9M11.4 8.6a3 3 0 0 0-4.2 0l-2.3 2.3a3 3 0 0 0 4.2 4.2l.9-.9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
            )
        default:
            return (
                <svg {...common}><Mark bg="#EEF0F4">
                    <circle cx="10" cy="10" r="5.3" fill="none" stroke="#5B6170" strokeWidth="1.4" />
                    <path d="M4.8 10h10.4M10 4.7c1.6 1.5 2.3 3.3 2.3 5.3s-.7 3.8-2.3 5.3c-1.6-1.5-2.3-3.3-2.3-5.3s.7-3.8 2.3-5.3z" fill="none" stroke="#5B6170" strokeWidth="1.2" />
                </Mark></svg>
            )
    }
}

export function HomeCloseIcon() {
    return <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden focusable={false}><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
}
