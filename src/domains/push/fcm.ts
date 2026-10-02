// domains/push — 안드로이드 알림(구글 FCM HTTP v1). 서비스 계정 열쇠로 구글 출입증(OAuth2)을 받아 보낸다. 새 꾸러미 없음.
//
// 환경변수 (Vercel):
//   FCM_SERVICE_ACCOUNT_JSON  파이어베이스 서비스 계정 열쇠 파일(JSON) 내용 통째로. 「알림 보내기」 권한이 있어야 한다
//   FCM_PROJECT_ID            (선택) 비우면 열쇠 파일의 project_id (curiai-57dc7)

import { createSign } from 'node:crypto'
import type { DeliveryResult, PushDevice, PushMessage, Transport } from './types'

type Env = Record<string, string | undefined>

export interface ServiceAccount { client_email: string; private_key: string; project_id?: string }

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'

export function fcmConfig(env: Env = process.env): { sa: ServiceAccount; projectId: string } | null {
    const raw = env.FCM_SERVICE_ACCOUNT_JSON?.trim()
    if (!raw) return null
    try {
        const sa = JSON.parse(raw) as ServiceAccount
        if (!sa.client_email || !sa.private_key) return null
        sa.private_key = sa.private_key.replace(/\\n/g, '\n')
        const projectId = env.FCM_PROJECT_ID?.trim() || sa.project_id
        if (!projectId) return null
        return { sa, projectId }
    } catch {
        return null
    }
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')

/** 구글 출입증을 받기 위한 서명(RS256). 1시간짜리 */
export function makeGoogleAssertion(sa: ServiceAccount, nowSec: number): string {
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL, iat: nowSec, exp: nowSec + 3600 }))
    const input = `${head}.${claims}`
    const signer = createSign('RSA-SHA256')
    signer.update(input)
    return `${input}.${b64url(signer.sign(sa.private_key))}`
}

type FcmError = { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } }

export function classifyFcm(status: number, body: string): DeliveryResult {
    if (status >= 200 && status < 300) return { ok: true }
    let j: FcmError = {}
    try { j = JSON.parse(body) as FcmError } catch { /* 빈 몸통 */ }
    const code = j.error?.details?.find(d => d.errorCode)?.errorCode ?? j.error?.status ?? ''
    const msg = j.error?.message ?? ''
    // UNREGISTERED = 앱을 지웠거나 번호가 만료. INVALID_ARGUMENT 중 「번호가 틀림」도 죽은 번호로 본다
    const disable = code === 'UNREGISTERED' || status === 404 ||
        (code === 'INVALID_ARGUMENT' && /registration token/i.test(msg))
    return { ok: false, error: `fcm ${status}${code ? ` ${code}` : ''}`, disable }
}

/** 안드로이드 알림 몸통. data 값은 모두 글자여야 한다 */
export function fcmMessage(token: string, msg: PushMessage): Record<string, unknown> {
    const data: Record<string, string> = { sendId: msg.sendId, type: msg.type }
    if (msg.deeplink) data.deeplink = msg.deeplink
    return {
        message: {
            token,
            notification: { title: msg.title, body: msg.body },
            data,
            android: { priority: 'HIGH' },
        },
    }
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ status: number; text(): Promise<string> }>

export function createFcmTransport(opts: { env?: Env; fetch?: Fetch; nowSec?: () => number } = {}): Transport {
    const cfg = fcmConfig(opts.env)
    const doFetch: Fetch = opts.fetch ?? ((url, init) => fetch(url, init))
    const nowSec = opts.nowSec ?? (() => Math.floor(Date.now() / 1000))
    let cached: { token: string; exp: number } | null = null

    async function accessToken(): Promise<string> {
        const t = nowSec()
        if (cached && cached.exp - 60 > t) return cached.token
        const res = await doFetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: makeGoogleAssertion(cfg!.sa, t),
            }).toString(),
        })
        const text = await res.text()
        if (res.status !== 200) throw new Error(`fcm 출입증 실패 ${res.status}`)
        const j = JSON.parse(text) as { access_token: string; expires_in?: number }
        cached = { token: j.access_token, exp: t + (j.expires_in ?? 3600) }
        return cached.token
    }

    return {
        ready: () => cfg !== null,
        async send(device: PushDevice, msg: PushMessage): Promise<DeliveryResult> {
            if (!cfg) return { ok: false, error: 'fcm 열쇠 없음', disable: false }
            const token = await accessToken()
            const res = await doFetch(`https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`, {
                method: 'POST',
                headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
                body: JSON.stringify(fcmMessage(device.token, msg)),
            })
            return classifyFcm(res.status, await res.text())
        },
    }
}
