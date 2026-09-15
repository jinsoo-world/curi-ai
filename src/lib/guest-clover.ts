/**
 * 가입 안 한 손님의 클로버 — 대표 확정 2026-09-15
 * 「클로버 60개를 주면 되잖아. 20개씩 3개 소진하면 끝나게끔」
 *
 * 회원과 같은 자로 잰다. 다만 손님은 계정이 없으니 잔액을 어디에 적어둘 수 없다.
 * 그래서 「하루 동안 쓴 값을 더해서 60에서 뺀다」로 계산한다.
 * 같은 인터넷 주소이거나 같은 브라우저면 같은 손님으로 본다.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { GUEST_CLOVERS } from '@/domains/trial'

export { GUEST_CLOVERS }

/** 이 손님이 하루 동안 쓴 클로버 */
export async function 손님이쓴값(ip: string, 표식: string | null): Promise<number> {
    try {
        const admin = createAdminClient()
        const 하루전 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        // 표식이 있으면 그 브라우저만 센다.
        // 주소(IP)로 묶으면 같은 와이파이·같은 통신사를 쓰는 사람들이 한 사람으로 합쳐진다.
        // 휴대폰 통신사는 수천 명이 한 주소를 같이 쓴다(2026-09-15 홍보 직전에 발견).
        const 조회 = admin
            .from('guest_generations')
            .select('cost')
            .gte('created_at', 하루전)
        const { data } = 표식
            ? await 조회.eq('fingerprint', 표식)
            : await 조회.eq('ip', ip)
        return (data ?? []).reduce((합, r) => 합 + (r.cost ?? 20), 0)
    } catch {
        // 못 세면 안 쓴 것으로 본다(손님에게 불리하지 않게)
        return 0
    }
}

/** 남은 클로버 */
export async function 손님잔액(ip: string, 표식: string | null): Promise<number> {
    return Math.max(0, GUEST_CLOVERS - (await 손님이쓴값(ip, 표식)))
}

/** 요청에서 인터넷 주소 꺼내기 */
export function 주소꺼내기(h: Headers): string {
    return h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
