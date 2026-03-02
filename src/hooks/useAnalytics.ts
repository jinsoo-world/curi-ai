'use client'

import { createClient } from '@/lib/supabase/client'

interface TrackEventOptions {
    userId?: string
    sessionId?: string
    properties?: Record<string, unknown>
    referralSource?: string
    pagePath?: string
}

/**
 * Analytics 이벤트 추적 유틸리티
 * analytics_events 테이블에 이벤트 기록
 */
export function useAnalytics() {
    const supabase = createClient()

    const getDeviceType = (): string => {
        if (typeof window === 'undefined') return 'unknown'
        const w = window.innerWidth
        if (w < 768) return 'mobile'
        if (w < 1024) return 'tablet'
        return 'desktop'
    }

    const trackEvent = async (
        eventName: string,
        options: TrackEventOptions = {}
    ) => {
        try {
            const { data: { user } } = await supabase.auth.getUser()

            await supabase.from('analytics_events').insert({
                user_id: options.userId || user?.id || null,
                session_id: options.sessionId || null,
                event_name: eventName,
                event_properties: options.properties || {},
                referral_source: options.referralSource || null,
                device_type: getDeviceType(),
                page_path: options.pagePath || (typeof window !== 'undefined' ? window.location.pathname : null),
            })
        } catch (error) {
            // Analytics는 실패해도 앱에 영향 없음
            console.warn('Analytics event failed:', error)
        }
    }

    return { trackEvent }
}

/**
 * 서버 사이드에서 사용 가능한 이벤트 트래킹
 */
export async function trackServerEvent(
    eventName: string,
    options: TrackEventOptions = {}
) {
    try {
        const { createAdminClient } = await import('@/lib/supabase/admin')
        const supabase = createAdminClient()

        await supabase.from('analytics_events').insert({
            user_id: options.userId || null,
            session_id: options.sessionId || null,
            event_name: eventName,
            event_properties: options.properties || {},
            referral_source: options.referralSource || null,
            device_type: 'server',
            page_path: options.pagePath || null,
        })
    } catch (error) {
        console.warn('Server analytics event failed:', error)
    }
}
