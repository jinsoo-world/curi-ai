'use client'

/**
 * 들어온 길을 한 번만 적어 보낸다 — 대표 지시 2026-09-17, 2026-10-05 광고비 판단용으로 넓힘
 *
 * 한 사람이 화면을 옮겨 다닐 때마다 적으면 숫자가 부풀어 유입이 아니라 클릭 수가 된다.
 * 그래서 이 브라우저 창에서 **처음 들어온 한 번만** 남긴다(sessionStorage 로 잠근다).
 *
 * 2026-10-05: 주소나 링크 없이 직접 들어온 방문도 한 줄 남긴다(기기, 운영체제, 앱 여부, 추천 코드와 함께).
 *             로그인하러 갔다 돌아온 것은 유입이 아니므로 남기지 않는다.
 *             로그인한 사람이면 처음 들어온 길을 가입 기록에 한 번 잇는다(/api/track/attribution).
 */
import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { detectDevice, ensureVisitorIds, recordFirstTouch, type FirstTouch } from '@/lib/first-touch'
import { isAuthReturn } from '@/domains/acquisition/labels'

const 잠금열쇠 = 'curi:visit-logged'
const 잇기열쇠 = 'curi:attr-linked'
let 마지막시도 = 0

function nativePlatform(): string | null {
    try {
        const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor
        if (cap?.isNativePlatform?.()) return cap.getPlatform?.() ?? null
    } catch { /* 웹 */ }
    return null
}

/** 로그인 쿠키(sb-…-auth-token)가 있으면 로그인한 사람으로 본다. 손님은 서버를 부르지 않는다 */
function 로그인같다(): boolean {
    try { return /(?:^|;\s*)sb-[^=;]*-auth-token/.test(document.cookie) } catch { return false }
}

async function 가입기록에잇기(ft: FirstTouch | null, ids: { anonId: string; visitorId: string }) {
    try {
        if (!ft || localStorage.getItem(잇기열쇠)) return
        if (!로그인같다()) return
        if (Date.now() - 마지막시도 < 30_000) return
        마지막시도 = Date.now()
        const r = await fetch('/api/track/attribution', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ first_touch: ft, anonId: ids.anonId, visitorId: ids.visitorId }),
        })
        const d = await r.json().catch(() => ({}))
        if (d?.ok && d.done) localStorage.setItem(잇기열쇠, '1')
    } catch { /* 계측이 화면을 막지 않는다 */ }
}

export default function VisitTracker() {
    const pathname = usePathname()
    const params = useSearchParams()

    useEffect(() => {
        // 어느 화면이든 처음 열면 방문자 표식과 처음 들어온 길을 남긴다 (가입 저장 때 함께 간다)
        let ft: FirstTouch | null = null
        let ids = { anonId: '', visitorId: '' }
        const native = nativePlatform()
        try {
            ids = ensureVisitorIds(localStorage)
            ft = recordFirstTouch(localStorage, {
                params: new URLSearchParams(params.toString()), referrer: document.referrer, host: location.host, path: pathname,
                ua: navigator.userAgent, nativePlatform: native,
            })
        } catch { /* 저장이 막힌 브라우저 */ }
        void 가입기록에잇기(ft, ids)

        try {
            if (sessionStorage.getItem(잠금열쇠)) return
        } catch { /* 저장이 막힌 브라우저면 그냥 한 번 보낸다 */ }

        const utm_source = params.get('utm_source')
        const ref = params.get('ref')
        const referrer = typeof document !== 'undefined' ? document.referrer : ''
        // 우리 안에서 이동한 것은 유입이 아니다. 로그인 갔다 돌아온 것도 아니다
        const 우리안 = referrer && typeof location !== 'undefined' && referrer.includes(location.host)
        if (!utm_source && !ref && 우리안) return
        if (!utm_source && isAuthReturn(referrer)) return

        // 먼저 잠그고 보낸다 (화면이 빨리 바뀌어도 두 번 남지 않게). 실패하면 푼다
        try { sessionStorage.setItem(잠금열쇠, '1') } catch { /* 못 잠그면 다음에 한 번 더 남는다 */ }
        const dev = detectDevice(navigator.userAgent, native)
        void fetch('/api/track/visit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: pathname,
                utm_source,
                utm_medium: params.get('utm_medium'),
                utm_campaign: params.get('utm_campaign'),
                referrer: 우리안 ? null : referrer,
                ref_code: ref,
                anon_id: ids.anonId,
                visitor_id: ids.visitorId,
                ...dev,
            }),
        }).then(r => {
            if (!r.ok) { try { sessionStorage.removeItem(잠금열쇠) } catch { /* 무시 */ } }
        }).catch(() => {
            try { sessionStorage.removeItem(잠금열쇠) } catch { /* 무시 */ }
        })
    }, [pathname, params])

    return null
}
