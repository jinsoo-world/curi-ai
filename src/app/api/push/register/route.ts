// POST /api/push/register — 앱(아이폰·안드로이드)이 알림 기기 번호를 등록한다. 로그인한 사람만(Bearer 또는 쿠키).
// 몸통: { platform: 'ios'|'android', token, apnsEnv?: 'sandbox'|'production', appVersion?, locale?, timezone? }
// 같은 번호가 이미 있으면(다른 계정이었어도) 지금 계정으로 옮기고 다시 켠다. 앱은 실행·로그인·로그인 표시 갱신 때마다 부른다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseRegisterBody, registerDevice } from '@/domains/push'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const TABLE_MISSING = new Set(['42P01', 'PGRST205'])

export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const db = createAdminClient()
    const rl = await checkRateLimit(db, rateLimitKey('push-register', user.id), 20, 60)
    if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('알림 등록') }, { status: 429 })

    const parsed = parseRegisterBody(await req.json().catch(() => null))
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

    const error = await registerDevice(db, user.id, parsed.value)
    if (error) {
        if (error.code && TABLE_MISSING.has(error.code)) return NextResponse.json({ error: '알림 표가 아직 준비되지 않았어요', tableMissing: true }, { status: 503 })
        console.error('[push/register]', error.message)
        return NextResponse.json({ error: '기기 번호를 저장하지 못했어요' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
}
