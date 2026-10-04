// 처음 들어온 길 (대표 지시 0929). 어느 화면이든 처음 열 때 방문자 표식을 만들고,
// 처음 들어온 utm 과 referrer 를 한 번만 적어 둔다. 가입 저장 때 표식(curi_visitor_id, curi_anon)이 함께 간다.

export const VISITOR_KEY = 'curi_visitor_id'
export const ANON_KEY = 'curi_anon'
export const FIRST_TOUCH_KEY = 'curi_first_touch'

export interface FirstTouch {
    utm_source: string | null
    utm_medium: string | null
    utm_campaign: string | null
    referrer: string | null
    path: string
    at: string
    /** 주소의 ?ref= (추천 링크). 예전에 적은 기록에는 없다 */
    ref_code?: string | null
    /** 처음 들어온 기기 (mobile, pc), 운영체제, 앱 여부. 예전에 적은 기록에는 없을 수 있다 */
    device?: string | null
    os?: string | null
    app_shell?: string | null
}

export interface DeviceInfo { device: string | null; os: string | null; app_shell: string | null }

/** 브라우저 정보로 기기를 가른다. domains/os/onboarding.ts 의 detectClientContext 와 같은 규칙 */
export function detectDevice(ua: string, nativePlatform?: string | null): DeviceInfo {
    const c = detectClientContext(ua, nativePlatform)
    return { device: c.device, os: c.os, app_shell: c.app_shell }
}

import { detectClientContext } from '@/domains/os/onboarding'

type Store = Pick<Storage, 'getItem' | 'setItem'>

const newId = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))

/** 방문자 표식 두 개를 없으면 만든다 (값과 열쇠 이름은 예전 그대로) */
export function ensureVisitorIds(store: Store): { visitorId: string; anonId: string } {
    let visitorId = store.getItem(VISITOR_KEY) || ''
    if (!visitorId) { visitorId = newId(); store.setItem(VISITOR_KEY, visitorId) }
    let anonId = store.getItem(ANON_KEY) || ''
    if (!anonId) { anonId = Math.random().toString(36).slice(2) + Date.now().toString(36); store.setItem(ANON_KEY, anonId) }
    return { visitorId, anonId }
}

/** 처음 들어온 길을 한 번만 적는다. 이미 있으면 그대로 돌려준다 */
export function recordFirstTouch(store: Store, input: { params: URLSearchParams; referrer: string; host: string; path: string; now?: Date; ua?: string; nativePlatform?: string | null }): FirstTouch {
    const dev: DeviceInfo = input.ua ? detectDevice(input.ua, input.nativePlatform) : { device: null, os: null, app_shell: null }
    const old = store.getItem(FIRST_TOUCH_KEY)
    if (old) {
        try {
            const ft = JSON.parse(old) as FirstTouch
            // 기기는 이 브라우저의 성질이라, 예전에 적을 때 빠졌으면 지금 채워도 같다
            if (!ft.device && dev.device) { Object.assign(ft, dev); store.setItem(FIRST_TOUCH_KEY, JSON.stringify(ft)) }
            return ft
        } catch { /* 망가졌으면 새로 쓴다 */ }
    }
    const ours = !!input.referrer && !!input.host && input.referrer.includes(input.host)
    const ft: FirstTouch = {
        utm_source: input.params.get('utm_source'),
        utm_medium: input.params.get('utm_medium'),
        utm_campaign: input.params.get('utm_campaign'),
        referrer: input.referrer && !ours ? input.referrer.slice(0, 200) : null,
        path: input.path,
        at: (input.now ?? new Date()).toISOString(),
        ref_code: input.params.get('ref')?.trim().slice(0, 40) || null,
        ...dev,
    }
    store.setItem(FIRST_TOUCH_KEY, JSON.stringify(ft))
    return ft
}
