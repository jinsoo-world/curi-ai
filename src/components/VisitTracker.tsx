'use client'

/**
 * 들어온 길을 한 번만 적어 보낸다 — 대표 지시 2026-09-17
 *
 * 한 사람이 화면을 옮겨 다닐 때마다 적으면 숫자가 부풀어 유입이 아니라 클릭 수가 된다.
 * 그래서 이 브라우저 창에서 **처음 들어온 한 번만** 남긴다(sessionStorage 로 잠근다).
 */
import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const 잠금열쇠 = 'curi:visit-logged'

export default function VisitTracker() {
    const pathname = usePathname()
    const params = useSearchParams()

    useEffect(() => {
        try {
            if (sessionStorage.getItem(잠금열쇠)) return
        } catch { /* 저장이 막힌 브라우저면 그냥 한 번 보낸다 */ }

        const utm_source = params.get('utm_source')
        const referrer = typeof document !== 'undefined' ? document.referrer : ''
        // 우리 안에서 이동한 것은 유입이 아니다
        const 우리안 = referrer && typeof location !== 'undefined' && referrer.includes(location.host)
        if (!utm_source && (!referrer || 우리안)) return

        let anon = ''
        try {
            anon = localStorage.getItem('curi_anon') || ''
            if (!anon) { anon = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('curi_anon', anon) }
        } catch { /* 표식을 못 만들면 비워 보낸다 */ }

        void fetch('/api/track/visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: pathname,
                utm_source,
                utm_medium: params.get('utm_medium'),
                utm_campaign: params.get('utm_campaign'),
                referrer: 우리안 ? null : referrer,
                anon_id: anon,
            }),
        }).then(() => {
            try { sessionStorage.setItem(잠금열쇠, '1') } catch { /* 못 잠그면 다음에 한 번 더 남는다 */ }
        }).catch(() => { /* 계측이 화면을 막지 않는다 */ })
    }, [pathname, params])

    return null
}
