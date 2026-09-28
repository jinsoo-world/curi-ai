'use client'
import { createClient } from '@/lib/supabase/client'

/** 로그인한 사람의 추천코드 — 없거나 비회원이면 null */
export async function getMyReferralCode(): Promise<{ userId: string; code: string | null } | null> {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return null
    const { data } = await supabase.from('users').select('referral_code').eq('id', user.id).maybeSingle()
    return { userId: user.id, code: data?.referral_code ?? null }
}
