'use client'

/**
 * 고른 것을 기억한다 — 전수조사 17번
 *
 * 뒤로 갔다 오거나 충전하고 돌아오면 배경·옷·나이가 다 날아갔다.
 * 중장년에게 같은 고르기를 두 번 시키면 거기서 그만둔다.
 */
import { useEffect, useState } from 'react'

export function use기억<T extends string | null>(키: string, 처음: T): [T, (v: T) => void] {
    const [값, set값] = useState<T>(처음)

    useEffect(() => {
        try {
            const v = localStorage.getItem(`curi_pick_${키}`)
            if (v) set값(v as T)
        } catch {
            // 사생활 보호 모드 등에서 막힐 수 있다. 기본값으로 간다.
        }
    }, [키])

    const 바꾸기 = (v: T) => {
        set값(v)
        try {
            if (v === null) localStorage.removeItem(`curi_pick_${키}`)
            else localStorage.setItem(`curi_pick_${키}`, v)
        } catch {}
    }

    return [값, 바꾸기]
}
