// 가입 온보딩 서버 쪽 (대표 승인 0928). 로그인 콜백과 /api/os/onboarding 이 같이 쓴다.
// users 행은 가입 트리거(handle_new_user)가 콜백보다 먼저 만든다. 그래서 새 회원 여부는
// user_onboarding 행과 로그인 계정 가입 시각으로 가린다 (needsOnboarding).
// 추천 보상(클로버)은 여기서 주지 않는다. 귀속 기록(users.referred_by, user_onboarding.referrer_id)만 남긴다.
import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanRefCode, needsOnboarding, TERMS_VERSION } from './onboarding'

type Db = SupabaseClient

/** 초대 코드를 이 회원에게 귀속한다. 이미 귀속돼 있으면 덮어쓰지 않는다. 자기 코드는 받지 않는다 */
export async function attributeReferral(db: Db, userId: string, rawCode: unknown, via: 'link' | 'code'): Promise<{ ok: boolean }> {
    const code = cleanRefCode(rawCode)
    if (!code) return { ok: false }
    const { data: referrer } = await db.from('users').select('id, referral_code').eq('referral_code', code).maybeSingle()
    if (!referrer || referrer.id === userId) return { ok: false }
    await db.from('users').update({ referred_by: referrer.referral_code }).eq('id', userId).is('referred_by', null)
    await db.from('user_onboarding')
        .update({ referral_code: referrer.referral_code, referral_via: via, referrer_id: referrer.id, updated_at: new Date().toISOString() })
        .eq('user_id', userId).is('referrer_id', null)
    return { ok: true }
}

/**
 * 로그인할 때마다 부른다. 새 가입자면 온보딩 행을 만들고(약관 동의 시각, 초대 링크 귀속) true 를 돌려준다.
 * 로그인 화면에서 필수 약관에 동의한 시각(termsAt)이 있으면 users.terms_agreed_at 이 비어 있을 때만 채운다.
 */
export async function ensureOnboardingRow(db: Db, a: {
    userId: string
    authCreatedAt: string | null | undefined
    refCookie: string | null | undefined
    termsAt: string | null
    provider: string | null
}): Promise<boolean> {
    if (a.termsAt) {
        await db.from('users').update({ terms_agreed_at: a.termsAt }).eq('id', a.userId).is('terms_agreed_at', null)
    }
    const { data: row, error } = await db.from('user_onboarding').select('status').eq('user_id', a.userId).maybeSingle()
    if (error) return false   // 표를 못 읽으면 온보딩으로 보내지 않는다 (로그인을 막지 않는다)
    const needs = needsOnboarding({ status: row?.status, authCreatedAt: a.authCreatedAt })
    if (!row && needs) {
        const { error: insErr } = await db.from('user_onboarding').upsert({
            user_id: a.userId,
            terms_version: a.termsAt ? TERMS_VERSION : null,
            age_agreed_at: a.termsAt,
            terms_agreed_at: a.termsAt,
            privacy_agreed_at: a.termsAt,
        }, { onConflict: 'user_id', ignoreDuplicates: true })
        if (insErr) return false
        if (a.provider) await db.from('users').update({ auth_provider: a.provider }).eq('id', a.userId)
        if (a.refCookie) await attributeReferral(db, a.userId, a.refCookie, 'link')
    }
    return needs
}
