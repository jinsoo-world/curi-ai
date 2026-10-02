// POST /api/account/delete — 회원 탈퇴 (App Store 5.1.1(v))
// 웹(쿠키)과 앱(Authorization: Bearer <Supabase access token>) 둘 다 된다.
// 본문: { confirm: "탈퇴", appleAuthorizationCode?: string }
// 응답: 200 { ok: true, hasStoreSubscription } (true 면 앱이 「앱스토어나 플레이스토어에서 구독을 해지해 주세요」 안내) / 400 확인 단어 틀림 / 401 로그인 필요 / 409 활성 구독 / 429 너무 잦음 / 500
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimitKey, rateLimitMessage } from '@/lib/rate-limit'
import { deleteAccount, parseDeleteBody, CONFIRM_WORD } from '@/domains/account/delete'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

        const body = await req.json().catch(() => null)
        const { confirmed, appleAuthorizationCode } = parseDeleteBody(body)
        if (!confirmed) {
            return NextResponse.json({ error: `탈퇴하려면 「${CONFIRM_WORD}」를 입력해 주세요.` }, { status: 400 })
        }

        const admin = createAdminClient()
        const rl = await checkRateLimit(admin, rateLimitKey('account-delete', user.id), 5, 3600)
        if (!rl.allowed) return NextResponse.json({ error: rateLimitMessage('탈퇴 요청') }, { status: 429 })

        const provider = (user.app_metadata?.provider as string | undefined) ?? user.identities?.[0]?.provider ?? null
        const result = await deleteAccount(admin, { id: user.id, email: user.email, provider }, { appleAuthorizationCode })
        if (!result.ok) {
            return NextResponse.json({ error: result.message, code: result.code }, { status: 409 })
        }
        return NextResponse.json({ ok: true, hasStoreSubscription: result.hasStoreSubscription === true })
    } catch (e) {
        console.error('[account-delete] 오류', e instanceof Error ? e.message : e)
        return NextResponse.json({ error: '탈퇴 처리 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.' }, { status: 500 })
    }
}
