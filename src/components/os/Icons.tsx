// 왼쪽 아래 줄 아이콘 (이모지 대신 선 아이콘, 22px). 색은 currentColor 라 토큰을 따른다.
import type { SVGProps } from 'react'

const base = (p: SVGProps<SVGSVGElement>) => ({
    width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p,
})

/** 봇 마켓 = 가게 차양 */
export function IconStore(p: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(p)}>
            <path d="M3 9.5 4.4 4.5h15.2L21 9.5" /><path d="M3 9.5c0 1.5 1.3 2.7 3 2.7s3-1.2 3-2.7c0 1.5 1.3 2.7 3 2.7s3-1.2 3-2.7c0 1.5 1.3 2.7 3 2.7s3-1.2 3-2.7" />
            <path d="M5 12v8h14v-8" /><path d="M10 20v-5h4v5" />
        </svg>
    )
}
/** 설정 = 톱니 */
export function IconGear(p: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(p)}>
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
    )
}
/** 내 계정 = 사람 */
export function IconUser(p: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(p)}>
            <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
    )
}
/** 로그인 = 문으로 들어가는 화살표 */
export function IconLogin(p: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(p)}>
            <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" />
        </svg>
    )
}
/** 앱으로 설치 = 폰 */
export function IconPhone(p: SVGProps<SVGSVGElement>) {
    return (
        <svg {...base(p)}>
            <rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" />
        </svg>
    )
}
