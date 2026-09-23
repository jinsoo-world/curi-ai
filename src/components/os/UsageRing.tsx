'use client'
// 사용 한도 원형 게이지 (클로드코드의 컨텍스트 원처럼). 회색 트랙 + 진행 호 + 가운데 퍼센트.
// 작은 것(입력창 위 단추)과 큰 것(모달 안)이 같은 그림을 쓴다. 색은 usage.css 의 data-tone 으로.
import { ringLabel, usageTone } from '@/domains/os/usage'

const R = 45                          // viewBox 100 기준 반지름
const C = 2 * Math.PI * R             // 원둘레

/** 그림만. 단추 아님 */
export function RingSvg({ pct, size, stroke = 10, showText = true }: { pct: number; size: number; stroke?: number; showText?: boolean }) {
    const p = Math.max(0, Math.min(100, pct))
    const dash = (p / 100) * C
    return (
        <svg className="os-usage-ring" data-tone={usageTone(p)} viewBox="0 0 100 100" width={size} height={size} aria-hidden focusable="false">
            <circle className="os-usage-ring-track" cx="50" cy="50" r={R} fill="none" strokeWidth={stroke} />
            <circle className="os-usage-ring-arc" cx="50" cy="50" r={R} fill="none" strokeWidth={stroke} strokeLinecap="round"
                strokeDasharray={`${dash} ${C - dash}`} transform="rotate(-90 50 50)" />
            {showText && <text className="os-usage-ring-text" x="50" y="50" textAnchor="middle" dominantBaseline="central">{p}</text>}
        </svg>
    )
}

/** 입력창 위 작은 단추. 클릭/엔터로 모달을 연다 */
export default function UsageRing({ pct, onClick, caption }: { pct: number; onClick: () => void; caption?: string }) {
    return (
        <button type="button" className="os-usage-ring-btn" onClick={onClick} aria-label={ringLabel(pct)} aria-haspopup="dialog" data-tone={usageTone(pct)}>
            <RingSvg pct={pct} size={30} stroke={12} showText={false} />
            <span className="os-usage-ring-caption">{caption ?? `사용 한도 ${pct}%`}</span>
        </button>
    )
}
