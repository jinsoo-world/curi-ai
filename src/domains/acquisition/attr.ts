// 가입한 사람의 처음 들어온 길 (user_onboarding)을 읽고 쓰는 곳. 읽기 화면과 결제 기록이 같이 쓴다.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Attribution } from './summarize'

export interface OnbAttr {
    user_id: string
    utm_source: string | null; utm_medium: string | null; utm_campaign: string | null
    referrer: string | null; ref_code: string | null; referral_code: string | null
    device: string | null; os: string | null; app_shell: string | null
    first_touch_at: string | null; acquisition_source: string | null
}

export const ONB_COLS = 'user_id, utm_source, utm_medium, utm_campaign, referrer, ref_code, referral_code, device, os, app_shell, first_touch_at, acquisition_source'

export function fromOnboarding(r: OnbAttr | undefined): Attribution | null {
    if (!r) return null
    return {
        utm_source: r.utm_source, utm_medium: r.utm_medium, utm_campaign: r.utm_campaign,
        referrer: r.referrer, ref_code: r.ref_code ?? r.referral_code,
        device: r.device, os: r.os, app_shell: r.app_shell,
        tracked: !!(r.first_touch_at || r.device || r.utm_source || r.referrer || r.ref_code || r.referral_code),
        survey: r.acquisition_source,
    }
}

/** 결제할 때 적어 둔 사본(jsonb)을 Attribution 으로 */
export function fromSnapshot(snap: unknown, survey: string | null): Attribution | null {
    if (!snap || typeof snap !== 'object') return null
    const s = snap as Record<string, unknown>
    const str = (k: string) => (typeof s[k] === 'string' && s[k] ? (s[k] as string) : null)
    const a: Attribution = {
        utm_source: str('utm_source'), utm_medium: str('utm_medium'), utm_campaign: str('utm_campaign'),
        referrer: str('referrer'), ref_code: str('ref_code'),
        device: str('device'), os: str('os'), app_shell: str('app_shell'),
        tracked: s.tracked === true,
        survey,
    }
    return a.tracked ? a : null
}


/** 결제할 때 남길 사본. 나중에 화면이 다시 계산하지 않아도 그때의 출처가 남는다 */
export function buildSnapshot(a: Attribution | null, provider: string): Record<string, unknown> {
    return {
        tracked: !!a?.tracked,
        provider,
        utm_source: a?.utm_source ?? null, utm_medium: a?.utm_medium ?? null, utm_campaign: a?.utm_campaign ?? null,
        referrer: a?.referrer ?? null, ref_code: a?.ref_code ?? null,
        device: a?.device ?? null, os: a?.os ?? null, app_shell: a?.app_shell ?? null,
    }
}

/**
 * 처음 결제한 사람이면 시각, 결제 경로, 그때의 출처 사본을 user_plans 에 적는다 (이미 적혀 있으면 그대로).
 * 결제를 막으면 안 되므로 어떤 실패도 던지지 않는다. 칸이 아직 없으면(옛 DB) 조용히 넘어간다.
 */
export async function markFirstPaid(db: SupabaseClient, userId: string, provider: 'toss' | 'revenuecat', now = new Date()): Promise<boolean> {
    try {
        const { data } = await db.from('user_onboarding').select(ONB_COLS).eq('user_id', userId).maybeSingle()
        const snap = buildSnapshot(fromOnboarding((data as OnbAttr | null) ?? undefined), provider)
        const { data: done, error } = await db.from('user_plans')
            .update({ first_paid_at: now.toISOString(), first_paid_provider: provider, paid_attribution: snap })
            .eq('user_id', userId).is('first_paid_at', null).select('user_id')
        if (error) { console.warn('[acquisition] 처음 결제 기록 실패:', error.message); return false }
        return (done ?? []).length > 0
    } catch (e) {
        console.warn('[acquisition] 처음 결제 기록 실패:', e instanceof Error ? e.message : e)
        return false
    }
}
