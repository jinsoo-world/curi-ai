// /api/billing/entitlement — 지금 내 요금제·끝나는 날·광고 없음 (대표 결정 1002)
//   앱(아이폰·안드로이드)은 Authorization: Bearer <Supabase 로그인 표시> 로 부른다(lib/supabase/bearer.ts). 웹은 쿠키.
//   무료로 보이면 레비뉴캣에 한 번 물어 맞춘다(REVENUECAT_SECRET_API_KEY 있을 때, 60초에 한 번, 앱 요청이나 레비뉴캣 흔적이 있는 사람만).
//   앱은 adFree 가 false 일 때만 광고를 띄운다. 토스(웹)와 레비뉴캣(앱) 어느 쪽에서 샀든 같은 user_plans 한 줄을 본다.
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { bearerFromHeader } from '@/lib/supabase/bearer'
import { createAdminClient } from '@/lib/supabase/admin'
import { planEntitlement } from '@/domains/os/plan'
import { maybeSyncRevenueCat } from '@/domains/os/revenuecat-sync'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }
/** 표가 없다는 뜻의 오류 (Postgres 42P01, PostgREST PGRST205) */
const TABLE_MISSING = new Set(['42P01', 'PGRST205'])

export async function GET() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401, headers: NO_STORE })

    const admin = createAdminClient({ longRunning: true })
    const read = () => admin.from('user_plans').select('plan, expires_at, last_order_id').eq('user_id', user.id).maybeSingle()
    let { data, error } = await read()
    if (error) {
        // 표가 아직 없으면 모두 무료. 그 밖의 오류는 무료로 잘못 알리지 않고 다시 묻게 한다
        if (error.code && TABLE_MISSING.has(error.code)) return NextResponse.json(planEntitlement(null), { headers: NO_STORE })
        console.error('[billing/entitlement] 읽기 실패:', error.message)
        return NextResponse.json({ error: '요금제를 읽지 못했어요. 잠시 뒤 다시 시도해 주세요.' }, { status: 503, headers: NO_STORE })
    }
    // 무료로 보이면 레비뉴캣에 한 번 물어 맞춘다(로그인 전에 산 구독, 넘겨받은 구독). 같은 사람은 60초에 한 번.
    // 앱(Bearer)에서 온 요청이거나 레비뉴캣 흔적이 있는 사람만 묻는다(웹 무료 회원마다 물으면 레비뉴캣에 빈 고객이 생긴다)
    const fromApp = !!bearerFromHeader((await headers()).get('authorization'))
    if (planEntitlement(data).plan === 'free' && await maybeSyncRevenueCat({ userId: user.id, db: admin, fromApp, planRow: data ?? null })) {
        const again = await read()
        if (!again.error) ({ data, error } = again)
    }
    return NextResponse.json(planEntitlement(data), { headers: NO_STORE })
}
