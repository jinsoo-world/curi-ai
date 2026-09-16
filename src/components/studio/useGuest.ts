'use client'

/**
 * 지금 보는 사람이 손님(비회원)인지 — 대표 지적 2026-09-15
 * 「클로버가 안보이는데 사진은 만들어지네?」
 *
 * 손님도 클로버 60개를 갖는다(대표 확정 0915). 회원과 같은 자로 잰다.
 * 손님인지 알아야 「가입하시면 100개 더」 같은 말을 자리에 맞게 적을 수 있다.
 */
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useGuest(): { 손님: boolean; 확인중: boolean } {
    const [손님, set손님] = useState(true)
    const [확인중, set확인중] = useState(true)

    useEffect(() => {
        let 살아있음 = true
        void (async () => {
            try {
                // 화면을 여는 신원 확인은 getSession 으로 — getUser 는 부를 때마다 서버에 다녀온다(2026-09-16 실측 수 초)
                const { data: { session } } = await createClient().auth.getSession()
                const user = session?.user ?? null
                if (!살아있음) return
                set손님(!user)
            } catch {
                // 못 물어보면 손님으로 둔다(값을 더 요구하지 않는 쪽)
            } finally {
                if (살아있음) set확인중(false)
            }
        })()
        return () => { 살아있음 = false }
    }, [])

    return { 손님, 확인중 }
}
