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

    const { error } = await db
        .from('users')
        .update(updateData)
        .eq('id', userId)

    if (error) {
        console.error('[User Actions] updateUserProfile error:', JSON.stringify(error))
        throw new Error(error.message || JSON.stringify(error))
    }
}
