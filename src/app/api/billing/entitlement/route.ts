// /api/billing/entitlement — 지금 내 요금제·끝나는 날·광고 없음 (대표 결정 1002)
//   앱(아이폰·안드로이드)은 Authorization: Bearer <Supabase 로그인 표시> 로 부른다(lib/supabase/bearer.ts). 웹은 쿠키.
//   앱은 adFree 가 false 일 때만 광고를 띄운다. 토스(웹)와 레비뉴캣(앱) 어느 쪽에서 샀든 같은 user_plans 한 줄을 본다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { planEntitlement } from '@/domains/os/plan'

export const dynamic = 'force-dynamic'

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })

    const { data, error } = await createAdminClient()
        .from('user_plans')
        .select('plan, expires_at, last_order_id')
        .eq('user_id', user.id)
        .maybeSingle()
    if (error) {
        // 표가 아직 없으면 모두 무료. 그 밖의 오류는 무료로 잘못 알리지 않고 다시 묻게 한다
        if (error.code === '42P01') return NextResponse.json(planEntitlement(null))
        console.error('[billing/entitlement] 읽기 실패:', error.message)
        return NextResponse.json({ error: '요금제를 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.' }, { status: 503 })
    }
    return NextResponse.json(planEntitlement(data), { headers: { 'Cache-Control': 'no-store' } })
}
