'use client'

/**
 * 「지금까지 N장이 만들어졌어요」 — 렌트리 참고 (대표 확정 2026-09-16 「2번」)
 *
 * 렌트리는 제품 카드마다 평점과 후기 수를 깔아 「남들도 쓴다」를 보여준다.
 * 우리는 후기가 아직 없으니 실제로 만들어진 장수를 센다. 표에서 센 수만 쓴다.
 * 적은 숫자는 오히려 말리므로 최소선을 넘을 때만 나온다(서버가 판단해 show 로 알려준다).
 */
import { useEffect, useState } from 'react'

export default function MadeCount({ 가운데 = false }: { 가운데?: boolean }) {
    const [장수, set장수] = useState<number | null>(null)

    useEffect(() => {
        let 살아있음 = true
        void (async () => {
            try {
                const r = await fetch('/api/stats/made')
                const d = await r.json()
                if (살아있음 && d?.show) set장수(d.made)
            } catch { /* 못 가져오면 조용히 안 보여준다 */ }
        })()
        return () => { 살아있음 = false }
    }, [])

    if (장수 === null) return null

    return (
        <p style={{
            display: 'flex', alignItems: 'center', gap: 7,
            justifyContent: 가운데 ? 'center' : 'flex-start',
            margin: '10px 0 0', padding: 0,
            fontSize: 14, fontWeight: 700, color: 'var(--먹연)',
            letterSpacing: '-0.02em',
        }}>
            <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: 'var(--진초록)', flexShrink: 0,
            }} />
            지금까지 {장수.toLocaleString()}장이 만들어졌어요
        </p>
    )
}
