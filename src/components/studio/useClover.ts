'use client'

/**
 * 지금 클로버가 몇 개인지 화면이 알게 한다 — 대표 지적 2026-09-15 「사진 만들어지는 것까지 모바일로 돌려봐」
 *
 * 무슨 일이었나 = 클로버를 다 쓴 뒤에도 「만들기」 단추가 초록이었다.
 * 모자란 줄은 한 번 눌러 거절당한 뒤에야 알았다. 누르기 전에 알아야 한다.
 *
 * 값은 위 띠(AppSidebar)가 읽어서 알려준다. 여기서는 그 알림만 듣는다.
 */
import { useEffect, useState } from 'react'
import { 지금클로버, 클로버듣기, 클로버씀듣기 } from '@/lib/clover-bus'

export function useClover(): number | null {
    const [값, set값] = useState<number | null>(지금클로버())

    useEffect(() => {
        // 띠가 먼저 읽었을 수 있다. 붙는 순간 한 번 맞춘다
        // eslint-disable-next-line react-hooks/set-state-in-effect
        set값(지금클로버())
        const 끄기1 = 클로버듣기(v => set값(v))
        const 끄기2 = 클로버씀듣기(얼마 => set값(v => (v === null ? v : Math.max(0, v - 얼마))))
        return () => { 끄기1(); 끄기2() }
    }, [])

    return 값
}
