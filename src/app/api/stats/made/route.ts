/**
 * 지금까지 만들어진 사진 수 — 렌트리 참고 (대표 확정 2026-09-16 「2번」)
 *
 * 렌트리는 카드마다 평점 4.7(17) 처럼 사람 흔적을 깔아둔다. 우리는 후기가 아직 없어
 * 대신 실제로 만들어진 장수를 센다. **지어내지 않는다. 표에서 센다.**
 *
 * 어디서 세나 —
 *   손님(비회원) = guest_generations 전체 (사진 만들 때만 쌓인다)
 *   회원         = credit_transactions 중 클로버가 빠져나간 사진 기록
 *                  ('증명사진 (' · '썸네일 (' · '… 프로필 사진 (' · '사진 화질 개선 (')
 *                  만들다 실패해 되돌린 건(type=refund)은 뺀다
 *
 * ⛔ tool_photos 로는 못 센다. 48시간 청소가 행까지 지운다.
 * 숫자가 적을 때는 화면에 내보내지 않는다(아래 최소선). 적은 숫자는 오히려 말린다.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/** 이 수보다 적으면 화면에 안 보여준다 */
export const 최소선 = 300

async function 세기(): Promise<number> {
    const admin = createAdminClient()

    const [손님, 회원사진, 회원썸네일, 되돌림] = await Promise.all([
        admin.from('guest_generations').select('id', { count: 'exact', head: true }),
        admin.from('credit_transactions').select('id', { count: 'exact', head: true })
            .lt('amount', 0).ilike('description', '%사진%'),
        admin.from('credit_transactions').select('id', { count: 'exact', head: true })
            .lt('amount', 0).ilike('description', '썸네일%'),
        admin.from('credit_transactions').select('id', { count: 'exact', head: true })
            .eq('type', 'refund').ilike('description', '%실패 되돌림%'),
    ])

    const 합 = (손님.count ?? 0) + (회원사진.count ?? 0) + (회원썸네일.count ?? 0) - (되돌림.count ?? 0)
    return Math.max(0, 합)
}

export async function GET() {
    try {
        const 장수 = await 세기()
        return NextResponse.json(
            { made: 장수, show: 장수 >= 최소선 },
            { headers: { 'Cache-Control': 's-maxage=900, stale-while-revalidate=3600' } },
        )
    } catch {
        // 못 세면 조용히 숨긴다. 화면에 오류를 띄우지 않는다.
        return NextResponse.json({ made: 0, show: false })
    }
}
