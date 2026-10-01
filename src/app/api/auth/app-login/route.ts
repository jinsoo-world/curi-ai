import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runAfterLogin, adminDbOr, parseAppLoginBody } from '@/domains/auth/after-login'

export const dynamic = 'force-dynamic'

/**
 * 앱(iOS·안드로이드) 로그인 직후 한 번 부른다 (2026-10-01).
 * 웹은 /auth/callback 이 하는 일(가입 선물·약관 동의 시각·초대 귀속·회원 행)을 앱은 거치지 않으므로 여기서 똑같이 한다.
 * 앱은 Authorization: Bearer <로그인 표시> 로 부른다 (lib/supabase/bearer.ts).
 * 몸통: { termsAgreedAt?: ISO 시각, displayName?: 애플이 첫 로그인 때만 주는 이름, refCode?: 초대 코드 }
 */
export async function POST(req: Request) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })

    const body = parseAppLoginBody(await req.json().catch(() => null))
    const db = adminDbOr(supabase)
    const result = await runAfterLogin(db, user, { refCode: body.refCode, termsAt: body.termsAt })

    // 애플은 이름을 첫 동의 때 한 번만 앱에 준다. 비어 있을 때만 채운다
    if (body.displayName) {
        await db.from('users').update({ display_name: body.displayName, updated_at: new Date().toISOString() })
            .eq('id', user.id).is('display_name', null)
    }

    return NextResponse.json({ ok: true, isNew: result.isNewProfile, goOnboarding: result.goOnboarding })
}
