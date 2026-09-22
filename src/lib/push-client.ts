// 브라우저 쪽 웹푸시 — 권한 묻기·구독·서버에 등록. 화면(NotificationSettings)이 부른다.
// 아이폰은 사파리에서 「홈 화면에 추가」한 뒤(iOS 16.4+)에만 된다.

export type PushState = 'unsupported' | 'denied' | 'off' | 'on'

function b64ToBytes(b64: string): Uint8Array {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4)
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(raw, c => c.charCodeAt(0))
}

export function pushSupported(): boolean {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** 아이폰 사파리인데 홈 화면 앱이 아니면 푸시가 안 된다 */
export function needsHomeScreen(): boolean {
    if (typeof navigator === 'undefined') return false
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches
    return ios && !standalone
}

export async function getPushState(): Promise<PushState> {
    if (!pushSupported()) return 'unsupported'
    if (Notification.permission === 'denied') return 'denied'
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    return sub ? 'on' : 'off'
}

/** 푸시 켜기: 권한 → 구독 → 서버 등록 */
export async function enablePush(vapidPublicKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!pushSupported()) return { ok: false, error: '이 브라우저는 푸시를 지원하지 않아요.' }
    if (needsHomeScreen()) return { ok: false, error: '아이폰은 사파리 공유 버튼 → 「홈 화면에 추가」한 뒤 그 앱에서 켤 수 있어요.' }
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, error: '알림 권한을 허용해 주셔야 푸시를 보낼 수 있어요.' }
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapidPublicKey) as BufferSource })
    const res = await fetch('/api/os/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent.slice(0, 200) }),
    })
    if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        return { ok: false, error: j.error || '서버에 등록하지 못했어요.' }
    }
    return { ok: true }
}

/** 푸시 끄기: 구독 해제 + 서버에서 지움 */
export async function disablePush(): Promise<void> {
    if (!pushSupported()) return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    const endpoint = sub.endpoint
    await sub.unsubscribe().catch(() => {})
    await fetch('/api/os/push/subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
    }).catch(() => {})
}
