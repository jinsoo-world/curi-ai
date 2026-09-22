// web-push 는 타입 파일을 같이 주지 않는다. 우리가 쓰는 만큼만 적는다(새 의존성을 늘리지 않기 위해).
declare module 'web-push' {
    export interface PushSubscriptionLike {
        endpoint: string
        keys: { p256dh: string; auth: string }
    }
    export interface SendResultLike { statusCode: number; body: string }
    export class WebPushError extends Error {
        statusCode: number
        body: string
        endpoint: string
    }
    export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void
    export function sendNotification(
        subscription: PushSubscriptionLike,
        payload?: string | Buffer,
        options?: { TTL?: number; urgency?: 'very-low' | 'low' | 'normal' | 'high'; timeout?: number },
    ): Promise<SendResultLike>
    export function generateVAPIDKeys(): { publicKey: string; privateKey: string }
    const webpush: {
        setVapidDetails: typeof setVapidDetails
        sendNotification: typeof sendNotification
        generateVAPIDKeys: typeof generateVAPIDKeys
        WebPushError: typeof WebPushError
    }
    export default webpush
}
