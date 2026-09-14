'use client'

/**
 * 글자가 차라락 흐르게 — 대표 지시 2026-09-14
 * 「대화 딱 바로 나오지 말고 부드럽게 차라락 나오게 해. 클로드 너처럼」
 *
 * 답은 이미 조금씩 오고 있었는데, 오는 대로 그대로 붙이니 한 덩어리씩 툭툭 튀었다.
 * 여기서는 받은 글을 바로 그리지 않고 뒤에 쌓아두고, 화면 그릴 때마다 몇 글자씩만 따라붙인다.
 * 많이 밀리면 빨리, 거의 따라잡았으면 천천히 — 그래서 끊기지 않고 흐르는 것처럼 보인다.
 */
import { useEffect, useRef, useState } from 'react'

export function useTypewriter(target: string, enabled: boolean): string {
    const [보임, set보임] = useState(enabled ? '' : target)
    const 목표 = useRef(target)
    const 프레임 = useRef<number | null>(null)

    목표.current = target

    useEffect(() => {
        if (!enabled) {
            set보임(target)
            return
        }

        let 그만 = false

        const 한번 = () => {
            if (그만) return
            set보임((지금) => {
                const t = 목표.current
                // 글이 통째로 바뀌었으면(새 답) 처음부터
                if (!t.startsWith(지금)) return t.slice(0, Math.min(지금.length, t.length))
                if (지금.length >= t.length) return 지금

                const 밀린글자 = t.length - 지금.length
                // 많이 밀렸으면 성큼, 거의 따라잡았으면 한두 글자씩
                const 걸음 = 밀린글자 > 160 ? 9 : 밀린글자 > 60 ? 5 : 밀린글자 > 20 ? 3 : 2
                return t.slice(0, 지금.length + 걸음)
            })
            프레임.current = requestAnimationFrame(한번)
        }

        프레임.current = requestAnimationFrame(한번)
        return () => {
            그만 = true
            if (프레임.current !== null) cancelAnimationFrame(프레임.current)
        }
    }, [enabled, target])

    // 다 끝났는데 아직 덜 그렸으면 남은 글을 잃지 않게 채워준다
    useEffect(() => {
        if (!enabled) set보임(target)
    }, [enabled, target])

    return enabled ? 보임 : target
}
