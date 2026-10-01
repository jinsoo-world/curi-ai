/**
 * 로그인 직후 서버가 하는 일 (웹 /auth/callback 과 앱 /api/auth/app-login 이 같이 쓴다, 2026-10-01 분리).
 * 가입 선물 클로버 · 새 가입자 온보딩 행(약관 동의 시각, 초대 귀속) · 첫 로그인 회원 행 · 카카오 추가 정보.
 * 웹 콜백에 있던 코드를 그대로 옮겼다. 쿠키·이동은 부르는 쪽이 한다.
 */
import type { User } from '@supabase/supabase-js'
import { SIGNUP_CLOVERS } from '@/domains/trial'
import { ensureOnboardingRow, attributeReferral } from '@/domains/os/onboarding-server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface AfterLoginResult {
    /** users 행이 없어서 이번에 만들었다 (= 새 회원 표시를 붙인다) */
    isNewProfile: boolean
    /** 새 가입자라 온보딩 화면으로 보낸다 */
    goOnboarding: boolean
}

/** 서비스 열쇠가 있으면 RLS 를 넘는 관리자 연결, 없으면 받은 연결 그대로 */
export function adminDbOr(fallback: Db): Db {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!serviceKey || !supabaseUrl) return fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require('@supabase/supabase-js')
    return createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

function kakaoExtras(user: User) {
    const m = user.user_metadata ?? {}
    return {
        phone: m.phone_number ? String(m.phone_number).replace(/[^0-9]/g, '').replace(/^82/, '0') : null,
        gender: (m.gender || null) as string | null,  // 'male' | 'female'
        birthYear: m.birthyear ? parseInt(m.birthyear) : null,
    }
}

export async function runAfterLogin(db: Db, user: User, opts: { refCode: string | null; termsAt: string | null }): Promise<AfterLoginResult> {
    // 가입 선물 — 대표 확정 2026-09-15
    //
    // 🚨 2026-09-15 수리 = 이 블록이 원래 「users 행이 아직 없을 때」 안에만 있었다.
    // 그런데 Supabase 는 가입하는 순간 users 행을 먼저 만든다. 그래서 여기 도착했을 땐
    // 이미 행이 있고, 선물 블록을 통째로 건너뛰었다. 실제로 받은 사람이 한 명도 없었다
    // (대표 지적 「jin 구글 계정에는 왜 클로버가 0개임」).
    // 이제 프로필이 있든 없든 돈다. 두 번 주는 것은 credit_transactions 기록이 막는다.
    // 이미 가입한 분들도 다음 로그인 때 자동으로 받는다.
    try {
        const { data: 이미받음 } = await db
            .from('credit_transactions')
            .select('id')
            .eq('user_id', user.id)
            .eq('type', 'signup_bonus')
            .limit(1)

        if (!이미받음?.length) {
            const { data: 새잔액, error: 더하기오류 } = await db.rpc('클로버_더하기', {
                그사람: user.id,
                더할값: SIGNUP_CLOVERS,
            })
            if (더하기오류) {
                console.error('[After Login] 가입 선물 지급 실패:', 더하기오류.message)
            } else {
                await db.from('credit_transactions').insert({
                    user_id: user.id,
                    amount: SIGNUP_CLOVERS,
                    balance_after: 새잔액 ?? SIGNUP_CLOVERS,
                    type: 'signup_bonus',
                    description: '가입 선물',
                })
            }
        }
    } catch (선물오류) {
        // 선물에 실패해도 로그인은 막지 않는다
        console.error('[After Login] 가입 선물 실패:', 선물오류)
    }

    // 새 가입자 온보딩 (대표 승인 0928). 가입 트리거가 users 행을 먼저 만들어 아래 「첫 로그인」 분기는
    // 거의 돌지 않는다. 그래서 새 회원 여부, 약관 동의 시각, 초대 링크 귀속은 여기서 따로 처리한다.
    let goOnboarding = false
    try {
        goOnboarding = await ensureOnboardingRow(db, {
            userId: user.id,
            authCreatedAt: user.created_at,
            refCookie: opts.refCode,
            termsAt: opts.termsAt,
            provider: user.app_metadata?.provider ?? null,
        })
    } catch (온보딩오류) {
        console.error('[After Login] 온보딩 준비 실패:', 온보딩오류)
    }

    // 기존 프로필 확인
    const { data: profile, error: profileError } = await db
        .from('users')
        .select('onboarding_completed, display_name, avatar_url, phone, gender, birth_year, auth_provider')
        .eq('id', user.id)
        .single()

    if (profileError) {
        console.log('[After Login] Profile lookup:', profileError.code, profileError.message)
    }

    const provider = user.app_metadata?.provider || 'unknown'

    if (!profile) {
        // 첫 로그인: OAuth 프로필로 users 레코드 생성
        const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.nickname || null
        const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || user.user_metadata?.profile_image_url || null
        const k = kakaoExtras(user)

        const { error: insertError } = await db.from('users').upsert({
            id: user.id,
            email: user.email,
            display_name: displayName,
            avatar_url: avatarUrl,
            auth_provider: provider,
            onboarding_completed: true,
            ...(k.phone ? { phone: k.phone } : {}),
            ...(k.gender ? { gender: k.gender === 'male' || k.gender === 'female' ? k.gender : null } : {}),
            ...(k.birthYear ? { birth_year: k.birthYear } : {}),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })

        if (insertError) {
            console.error('[After Login] User create error:', JSON.stringify(insertError))
        }

        // 추천 보상은 여기서 주지 않는다. 한 곳(휴대폰 인증 /api/trial/verify)에서 한 번만 준다.
        // 여기서는 귀속 기록만 남긴다 (코드 다듬기, 자기 코드 막기, 덮어쓰기 금지는 attributeReferral 이 한다)
        if (opts.refCode) {
            try {
                await attributeReferral(db, user.id, opts.refCode, 'link')
            } catch (refErr) {
                console.error('[After Login] Referral attribution error:', refErr)
            }
        }
        return { isNewProfile: true, goOnboarding }
    }

    // 기존 유저: 카카오 정보 업데이트 (전화번호, 성별, 출생연도, 아바타)
    const updates: Record<string, unknown> = {}
    if (!profile.avatar_url && user.user_metadata?.avatar_url) {
        updates.avatar_url = user.user_metadata.avatar_url
    }
    if (provider === 'kakao') {
        const k = kakaoExtras(user)
        if (k.phone && !profile.phone) updates.phone = k.phone
        // users.gender 는 'male', 'female', 'other' 만 받는다. 예전 '남성', '여성' 은 검사 규칙에 걸려 이 줄 전체(전화, 출생연도 포함)가 저장되지 않았다
        if (k.gender && !profile.gender) updates.gender = k.gender === 'male' || k.gender === 'female' ? k.gender : null
        if (k.birthYear && !profile.birth_year) updates.birth_year = k.birthYear
        if (!profile.auth_provider) updates.auth_provider = 'kakao'
    }
    if (Object.keys(updates).length > 0) {
        await db.from('users').update({
            ...updates,
            updated_at: new Date().toISOString(),
        }).eq('id', user.id)
        console.log(`[After Login] Updated existing user ${user.id}:`, Object.keys(updates))
    }
    return { isNewProfile: false, goOnboarding }
}

/** 앱이 로그인 직후 보내는 몸통. 믿을 수 없는 값이라 하나씩 거른다 */
export function parseAppLoginBody(body: unknown, now = Date.now()): { termsAt: string | null; displayName: string | null; refCode: string | null } {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    let termsAt: string | null = null
    if (typeof b.termsAgreedAt === 'string') {
        const t = Date.parse(b.termsAgreedAt)
        // 웹 약관 쿠키(parseTermsCookie)와 같은 기준: 미래 1분 넘거나 하루 지난 값은 믿지 않는다
        if (Number.isFinite(t) && t <= now + 60_000 && now - t <= 24 * 3600_000) termsAt = new Date(t).toISOString()
    }
    const displayName = typeof b.displayName === 'string' && b.displayName.trim() ? b.displayName.trim().slice(0, 40) : null
    const refCode = typeof b.refCode === 'string' && b.refCode.trim() ? b.refCode.trim().slice(0, 40) : null
    return { termsAt, displayName, refCode }
}
