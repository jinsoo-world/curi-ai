'use client'

/**
 * 클로버 숫자 — 바뀌면 눈에 보이게 굴러간다 · 대표 지적 2026-09-15
 * 「만들기 누르면 애니메이션 효과로 클로버가 차감되어야지」
 *
 * 중장년 기준으로 잡은 것
 *  - 숫자가 그냥 톡 바뀌면 바뀐 걸 못 본다. 0.7초에 걸쳐 굴려서 「줄어드는 중」이 보이게
 *  - 얼마가 빠졌는지도 숫자 위에 「−20」으로 띄운다. 1.2초 뒤 사라진다
 *  - 줄 때는 붉게, 받을 때는 초록으로. 색만으로도 방향을 안다
 *  - 움직임을 싫어하는 설정(prefers-reduced-motion)이면 굴리지 않고 바로 바꾼다
 */
import { useEffect, useRef, useState } from 'react'

export default function CloverCount({ 값 }: { 값: number | null }) {
    const [보이는값, set보이는값] = useState<number | null>(값)
    const [뱃지, set뱃지] = useState<number | null>(null)
    const 애니 = useRef<number | null>(null)
    const 앞값 = useRef<number | null>(값)

    useEffect(() => {
        // 값이 바뀔 때만 따라 그린다. 렌더 중이 아니라 그려진 뒤라 안전하다
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (값 === null) { set보이는값(null); 앞값.current = null; return }
        const 시작 = 앞값.current
        앞값.current = 값
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (시작 === null || 시작 === 값) { set보이는값(값); return }

        const 차 = 값 - 시작
        // eslint-disable-next-line react-hooks/set-state-in-effect
        set뱃지(차)
        const 뱃지치우기 = setTimeout(() => set뱃지(null), 1400)

        const 느리게싫음 = typeof window !== 'undefined'
            && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        if (느리게싫음) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            set보이는값(값)
            return () => clearTimeout(뱃지치우기)
        }

        const 걸릴시간 = 700
        const 언제 = performance.now()
        const 한칸 = (now: number) => {
            const t = Math.min(1, (now - 언제) / 걸릴시간)
            // 끝에서 부드럽게 멈춘다
            const 완 = 1 - Math.pow(1 - t, 3)
            set보이는값(Math.round(시작 + 차 * 완))
            if (t < 1) 애니.current = requestAnimationFrame(한칸)
        }
        애니.current = requestAnimationFrame(한칸)
        return () => {
            clearTimeout(뱃지치우기)
            if (애니.current) cancelAnimationFrame(애니.current)
        }
    }, [값])

    return (
        <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <span className="app-top-credit-num">
                {보이는값 === null ? '-' : 보이는값.toLocaleString()}
            </span>
            {뱃지 !== null && 뱃지 !== 0 && (
                <span
                    aria-hidden
                    style={{
                        position: 'absolute',
                        left: '50%',
                        top: -4,
                        transform: 'translateX(-50%)',
                        fontSize: 15,
                        fontWeight: 900,
                        whiteSpace: 'nowrap',
                        color: 뱃지 < 0 ? '#dc2626' : '#16a34a',
                        animation: '클로버뱃지 1.4s ease-out forwards',
                        pointerEvents: 'none',
                    }}
                >
                    {뱃지 < 0 ? '−' : '+'}{Math.abs(뱃지).toLocaleString()}
                </span>
            )}
            <style>{`
                @keyframes 클로버뱃지 {
                    0%   { opacity: 0; transform: translate(-50%, 6px) scale(0.9); }
                    18%  { opacity: 1; transform: translate(-50%, -14px) scale(1.06); }
                    70%  { opacity: 1; transform: translate(-50%, -22px) scale(1); }
                    100% { opacity: 0; transform: translate(-50%, -32px) scale(1); }
                }
            `}</style>
        </span>
    )
}
