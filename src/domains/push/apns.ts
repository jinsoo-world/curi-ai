// domains/push — 애플 알림(APNs) 보내기. HTTP/2 + 열쇠 파일(.p8)로 만든 서명(JWT, ES256). 새 꾸러미 없이 node 기본 기능만 쓴다.
//
// 환경변수 4개 (Vercel):
//   APNS_KEY_ID     애플 개발자 계정의 열쇠 번호 (62R8294YG5)
//   APNS_TEAM_ID    팀 번호 (2NS5S224QL)
//   APNS_KEY_P8     .p8 파일 내용 통째로 (-----BEGIN PRIVATE KEY----- 부터). 줄바꿈이 \n 글자로 들어와도 된다
//   APNS_BUNDLE_ID  앱 번호 (com.missiondriven.curiai)
// 기기마다 sandbox(엑스코드로 직접 깐 개발 빌드) / production(테스트플라이트·앱스토어) 주소가 다르다.

import { connect } from 'node:http2'
import { createPrivateKey, sign } from 'node:crypto'
import type { ApnsEnv, DeliveryResult, PushDevice, PushMessage, Transport } from './types'
import { mentorIdOf } from './deeplink'

export const APNS_HOSTS: Record<ApnsEnv, string> = {
    production: 'https://api.push.apple.com',
    sandbox: 'https://api.sandbox.push.apple.com',
}

type Env = Record<string, string | undefined>

export interface ApnsConfig { keyId: string; teamId: string; p8: string; bundleId: string }

export function apnsConfig(env: Env = process.env): ApnsConfig | null {
    const keyId = env.APNS_KEY_ID?.trim()
    const teamId = env.APNS_TEAM_ID?.trim()
    const p8 = env.APNS_KEY_P8?.replace(/\\n/g, '\n').trim()
    const bundleId = env.APNS_BUNDLE_ID?.trim()
    if (!keyId || !teamId || !p8 || !bundleId) return null
    return { keyId, teamId, p8, bundleId }
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')

/** 애플용 서명 표. 애플은 20~60분마다 새로 만들라고 한다(너무 자주 만들면 429) */
export function makeApnsJwt(c: Pick<ApnsConfig, 'keyId' | 'teamId' | 'p8'>, nowSec: number): string {
    const head = b64url(JSON.stringify({ alg: 'ES256', kid: c.keyId }))
    const claims = b64url(JSON.stringify({ iss: c.teamId, iat: nowSec }))
    const input = `${head}.${claims}`
    const sig = sign('sha256', Buffer.from(input), { key: createPrivateKey(c.p8), dsaEncoding: 'ieee-p1363' })
    return `${input}.${b64url(sig)}`
}

/** 이 이유면 기기 번호가 죽었다 = 그 기기를 끈다 */
const DEAD_REASONS = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic', 'ExpiredToken'])

export function classifyApns(status: number, body: string): DeliveryResult {
    if (status === 200) return { ok: true }
    let reason = ''
    try { reason = (JSON.parse(body) as { reason?: string }).reason ?? '' } catch { /* 빈 몸통 */ }
    const disable = status === 410 || DEAD_REASONS.has(reason)
    return { ok: false, error: `apns ${status}${reason ? ` ${reason}` : ''}`, disable }
}

/** 알림 안에 실어 보내는 것. 약속은 deeplink.ts 머리말. mentorId 는 예전 앱 호환용 */
export function apnsPayload(msg: PushMessage): Record<string, unknown> {
    const p: Record<string, unknown> = {
        aps: { alert: { title: msg.title, body: msg.body }, sound: 'default' },
        sendId: msg.sendId,
        type: msg.type,
    }
    if (msg.deeplink) {
        p.deeplink = msg.deeplink
        const mentorId = mentorIdOf(msg.deeplink)
        if (mentorId) p.mentorId = mentorId
    }
    return p
}

export type Http2Request = (origin: string, path: string, headers: Record<string, string>, body: string) => Promise<{ status: number; body: string }>

/** 기본 보내기: 보낼 때마다 연결을 열고 닫는다(지금 보내는 양으로는 충분하다) */
export const http2Request: Http2Request = (origin, path, headers, body) => new Promise((resolve, reject) => {
    const session = connect(origin)
    session.on('error', reject)
    const req = session.request({ ':method': 'POST', ':path': path, ...headers })
    req.setTimeout(10_000, () => { req.close(); session.close(); reject(new Error('apns 시간 초과')) })
    let status = 0
    let data = ''
    req.on('response', h => { status = Number(h[':status'] ?? 0) })
    req.setEncoding('utf8')
    req.on('data', chunk => { data += chunk })
    req.on('end', () => { session.close(); resolve({ status, body: data }) })
    req.on('error', e => { session.close(); reject(e) })
    req.end(body)
})

export function createApnsTransport(opts: { env?: Env; request?: Http2Request; nowSec?: () => number } = {}): Transport {
    const cfg = apnsConfig(opts.env)
    const request = opts.request ?? http2Request
    const nowSec = opts.nowSec ?? (() => Math.floor(Date.now() / 1000))
    let cached: { jwt: string; at: number } | null = null
    const jwt = () => {
        const t = nowSec()
        if (!cached || t - cached.at > 40 * 60) cached = { jwt: makeApnsJwt(cfg!, t), at: t }
        return cached.jwt
    }
    return {
        ready: () => cfg !== null,
        async send(device: PushDevice, msg: PushMessage): Promise<DeliveryResult> {
            if (!cfg) return { ok: false, error: 'apns 열쇠 없음', disable: false }
            const origin = APNS_HOSTS[device.apnsEnv ?? 'production']
            const res = await request(origin, `/3/device/${device.token}`, {
                authorization: `bearer ${jwt()}`,
                'apns-topic': cfg.bundleId,
                'apns-push-type': 'alert',
                'apns-priority': '10',
                'content-type': 'application/json',
            }, JSON.stringify(apnsPayload(msg)))
            return classifyApns(res.status, res.body)
        },
    }
}
