// GET  /api/os/payout → 내 정산 정보(계좌는 뒤 4자리만) + 저장 가능 여부(자물쇠가 있나)
// POST /api/os/payout → 정산 정보 저장. 계좌는 잠가서 넣는다. 로그에 계좌·휴대폰을 남기지 않는다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { connectorsEnabled, ConnectorKeyMissing } from '@/domains/connectors/crypto'
import { getPayoutProfile, savePayoutProfile, validatePayoutInput, PayoutTableMissing, BANKS } from '@/domains/os/payout'
import type { PayoutInput } from '@/domains/os/payout'

export const dynamic = 'force-dynamic'

async function me() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function GET() {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    try {
        const profile = await getPayoutProfile(createAdminClient(), user.id)
        return NextResponse.json({ profile, enabled: connectorsEnabled(), banks: BANKS, defaultEmail: user.email ?? '' })
    } catch (e) {
        console.error('[os/payout GET]', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '정산 정보를 불러오지 못했어요' }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const user = await me()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
    const db = createAdminClient()
    const rl = await checkRateLimit(db, rateLimitKey('payout', user.id), 10, 60)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('저장') }, { status: 429 })

    const body = await req.json().catch(() => null) as Partial<PayoutInput> | null
    const checked = validatePayoutInput(body)
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

    try {
        const profile = await savePayoutProfile(db, user.id, checked.value)
        return NextResponse.json({ profile, message: '정산 정보를 저장했어요.' })
    } catch (e) {
        if (e instanceof ConnectorKeyMissing) return NextResponse.json({ error: '정산 정보 저장은 준비 중이에요(자물쇠 열쇠가 아직 없어요)' }, { status: 503 })
        if (e instanceof PayoutTableMissing) return NextResponse.json({ error: '정산 정보 표가 아직 준비되지 않았어요(관리자에게 알려 주세요)', tableMissing: true }, { status: 503 })
        // 오류 글에 계좌·휴대폰이 섞이지 않게 종류만 남긴다
        console.error('[os/payout POST] 저장 실패', e instanceof Error ? e.constructor.name : typeof e)
        return NextResponse.json({ error: '정산 정보를 저장하지 못했어요' }, { status: 500 })
    }
}
