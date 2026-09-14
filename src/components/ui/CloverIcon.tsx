/**
 * 클로버 아이콘 — 큐리AI 의 값 단위
 *
 * 대표 지시 2026-09-14 = 「클로버 아이콘이 있어야지 임마」
 * 앞서 🍀 이모지를 화면에서 걷어냈는데, 값을 말하는 자리까지 같이 지웠다.
 * 이모지 대신 같은 굵기로 그린 아이콘을 쓴다(기기마다 모양이 안 바뀐다).
 */
export default function CloverIcon({ size = 16, color = '#22c55e' }: { size?: number; color?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden focusable="false">
            <path
                d="M12 12c0-2.2-1.3-4-3.4-4A3.1 3.1 0 0 0 5.5 11c0 1.7 1.4 3 3.1 3H12Z"
                fill={color}
            />
            <path
                d="M12 12c2.2 0 4-1.3 4-3.4A3.1 3.1 0 0 0 13 5.5c-1.7 0-3 1.4-3 3.1V12Z"
                fill={color}
            />
            <path
                d="M12 12c0 2.2 1.3 4 3.4 4a3.1 3.1 0 0 0 3.1-3c0-1.7-1.4-3-3.1-3H12Z"
                fill={color}
            />
            <path
                d="M12 12c-2.2 0-4 1.3-4 3.4a3.1 3.1 0 0 0 3 3.1c1.7 0 3-1.4 3-3.1V12Z"
                fill={color}
            />
            <path d="M12 12c-1.2 1.6-2 3.6-2.2 5.8" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
        </svg>
    )
}
