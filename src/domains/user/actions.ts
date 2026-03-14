// domains/user — 유저 데이터 변경 액션

import type { SupabaseClient } from '@supabase/supabase-js'
import type { OnboardingData, ProfileUpdateData } from './types'

/**
 * 온보딩 프로필 저장 (upsert)
 */
export async function saveOnboardingProfile(
    db: SupabaseClient,
    userId: string,
    email: string | undefined,
    data: OnboardingData,
    avatarUrl?: string | null,
) {
    const profileData = {
        id: userId,
        email,
        display_name: data.display_name || null,
        avatar_url: avatarUrl || null,
        interests: data.interests || [],
        birth_year: data.birth_year ? parseInt(String(data.birth_year)) : null,
        gender: data.gender || null,
        phone: data.phone || null,
        marketing_consent: data.marketing_consent ?? false,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await db
        .from('users')
        .upsert(profileData, { onConflict: 'id' })

    if (upsertError) {
        console.error('[User Actions] upsert error:', JSON.stringify(upsertError))

        // upsert 실패 시 update 시도
        const { id, email: _email, ...updateFields } = profileData
        const { error: updateError } = await db
            .from('users')
            .update(updateFields)
            .eq('id', userId)

        if (updateError) {
            console.error('[User Actions] update fallback error:', JSON.stringify(updateError))
            throw new Error(updateError.message || JSON.stringify(updateError))
        }
    }

    return profileData
}

/**
 * 프로필 편집 저장
 */
export async function updateUserProfile(
    db: SupabaseClient,
    userId: string,
    data: ProfileUpdateData,
) {
    const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    }

    if ('display_name' in data) updateData.display_name = data.display_name || null
    if ('interests' in data) updateData.interests = data.interests || []
    if ('birth_year' in data) updateData.birth_year = data.birth_year || null
    if ('gender' in data) updateData.gender = data.gender || null
    if ('avatar_url' in data) updateData.avatar_url = data.avatar_url || null
    if ('phone' in data) updateData.phone = data.phone || null
    if ('marketing_consent' in data) updateData.marketing_consent = data.marketing_consent ?? false
    if ('auto_tts' in data) updateData.auto_tts = data.auto_tts ?? false

    const { error } = await db
        .from('users')
        .update(updateData)
        .eq('id', userId)

    if (error) {
        console.error('[User Actions] updateUserProfile error:', JSON.stringify(error))
        throw new Error(error.message || JSON.stringify(error))
    }
}

// ─── Handle 예약어 (기존 라우트와 충돌 방지) ───
const RESERVED_HANDLES = new Set([
    'admin', 'api', 'auth', 'login', 'mentors', 'chat', 'chats',
    'creator', 'billing', 'onboarding', 'pricing', 'privacy',
    'profile', 'terms', '_next', 'favicon', 'public', 'static',
    'settings', 'help', 'support', 'about', 'blog', 'app',
])

// handle 형식: 영문 소문자 + 숫자 + 하이픈, 3~30자
const HANDLE_REGEX = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/

/**
 * handle 형식 검증
 */
export function validateHandle(handle: string): { valid: boolean; error?: string } {
    if (!handle) return { valid: false, error: 'handle을 입력해주세요.' }

    const normalized = handle.toLowerCase().trim()

    if (normalized.length < 3) return { valid: false, error: '3자 이상 입력해주세요.' }
    if (normalized.length > 30) return { valid: false, error: '30자 이하로 입력해주세요.' }
    if (!HANDLE_REGEX.test(normalized)) {
        return { valid: false, error: '영문 소문자, 숫자, 하이픈(-)만 사용 가능합니다.' }
    }
    if (RESERVED_HANDLES.has(normalized)) {
        return { valid: false, error: '사용할 수 없는 이름입니다.' }
    }

    return { valid: true }
}

/**
 * 유저 handle 설정
 */
export async function setUserHandle(
    db: SupabaseClient,
    userId: string,
    handle: string,
) {
    const normalized = handle.toLowerCase().trim()

    // 형식 검증
    const validation = validateHandle(normalized)
    if (!validation.valid) {
        throw new Error(validation.error)
    }

    // 중복 체크
    const { data: existing } = await db
        .from('users')
        .select('id')
        .eq('handle', normalized)
        .neq('id', userId)
        .maybeSingle()

    if (existing) {
        throw new Error('이미 사용 중인 handle입니다.')
    }

    // 저장
    const { error } = await db
        .from('users')
        .update({ handle: normalized, updated_at: new Date().toISOString() })
        .eq('id', userId)

    if (error) {
        console.error('[User Actions] setUserHandle error:', JSON.stringify(error))
        throw new Error(error.message || JSON.stringify(error))
    }

    return normalized
}
