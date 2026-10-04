// 애플 로그인 토큰 취소 — App Store 5.1.1(v): 애플로 가입한 사람이 탈퇴하면 애플 쪽 연결도 끊어야 한다.
//
// 필요한 열쇠(대표 애플 개발자 계정에서 만들어 Vercel 환경변수로 넣는다. 지금은 없다):
//   APPLE_SIWA_KEY_ID        Apple Developer → Keys → Sign in with Apple 로 만든 열쇠의 Key ID
//   APPLE_SIWA_TEAM_ID       2NS5S224QL
//   APPLE_SIWA_CLIENT_ID     com.missiondriven.curiai   (앱 번들 ID. 앱에서 애플 로그인한 사람용)
//   APPLE_SIWA_WEB_CLIENT_ID 웹 로그인용 Services ID (예: com.missiondriven.curiai.web). 웹으로 애플 로그인한 사람의 연결을 끊을 때 쓴다. 없으면 위 번들 ID
//   APPLE_SIWA_PRIVATE_KEY   그 열쇠의 .p8 파일 내용 (줄바꿈은 \n 으로 적어도 된다)
// 넷 중 하나라도 없으면 건너뛰고 기록만 남긴다(탈퇴 자체는 막지 않는다).
//
// 흐름: 앱이 보낸 authorizationCode → /auth/token 으로 refresh_token 교환 → /auth/revoke 로 취소.
import { createPrivateKey, createSign } from 'node:crypto'

export interface AppleConfig {
    keyId: string
    teamId: string
    clientId: string
    privateKey: string
}

export type RevokeResult =
    | { revoked: true }
    | { revoked: false; reason: 'not_configured' | 'no_authorization_code' | 'token_exchange_failed' | 'revoke_failed' }

type FetchFn = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>

export function appleConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AppleConfig | null {
    const keyId = env.APPLE_SIWA_KEY_ID
    const teamId = env.APPLE_SIWA_TEAM_ID
    const clientId = env.APPLE_SIWA_CLIENT_ID
    const privateKey = env.APPLE_SIWA_PRIVATE_KEY
    if (!keyId || !teamId || !clientId || !privateKey) return null
    return { keyId, teamId, clientId, privateKey: privateKey.replace(/\\n/g, '\n') }
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')

/** 애플이 요구하는 client_secret(ES256 JWT, 유효 5분) */
function clientSecret(cfg: AppleConfig, nowSec = Math.floor(Date.now() / 1000)): string {
    const header = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId, typ: 'JWT' }))
    const payload = b64url(JSON.stringify({
        iss: cfg.teamId, iat: nowSec, exp: nowSec + 300, aud: 'https://appleid.apple.com', sub: cfg.clientId,
    }))
    const signer = createSign('SHA256')
    signer.update(`${header}.${payload}`)
    const sig = signer.sign({ key: createPrivateKey(cfg.privateKey), dsaEncoding: 'ieee-p1363' })
    return `${header}.${payload}.${b64url(sig)}`
}

const form = (o: Record<string, string>) => new URLSearchParams(o).toString()
const HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' }

/** 웹 로그인 때 보관해 둔 refresh token 으로 바로 끊는다(인증 코드 교환 단계 없음). clientId 는 그 토큰을 받을 때 쓴 ID */
export async function revokeStoredAppleToken(
    refreshToken: string,
    clientId: string,
    deps: { config?: AppleConfig | null; fetchFn?: FetchFn } = {},
): Promise<RevokeResult> {
    const base = deps.config === undefined ? appleConfigFromEnv() : deps.config
    if (!base) return { revoked: false, reason: 'not_configured' }
    const cfg = { ...base, clientId }
    const fetchFn: FetchFn = deps.fetchFn ?? (fetch as unknown as FetchFn)
    const rv = await fetchFn('https://appleid.apple.com/auth/revoke', {
        method: 'POST', headers: HEADERS,
        body: form({ client_id: cfg.clientId, client_secret: clientSecret(cfg), token: refreshToken, token_type_hint: 'refresh_token' }),
    })
    if (!rv.ok) {
        console.warn('[account-delete] 애플 보관 토큰 취소 실패', rv.status)
        return { revoked: false, reason: 'revoke_failed' }
    }
    return { revoked: true }
}

export async function revokeAppleTokens(
    authorizationCode: string | undefined,
    deps: { config?: AppleConfig | null; fetchFn?: FetchFn } = {},
): Promise<RevokeResult> {
    const cfg = deps.config === undefined ? appleConfigFromEnv() : deps.config
    if (!cfg) {
        console.log('[account-delete] 애플 열쇠가 설정되지 않아 토큰 취소를 건너뜁니다')
        return { revoked: false, reason: 'not_configured' }
    }
    if (!authorizationCode) {
        console.log('[account-delete] 애플 인증 코드가 없어 토큰 취소를 건너뜁니다')
        return { revoked: false, reason: 'no_authorization_code' }
    }
    const fetchFn: FetchFn = deps.fetchFn ?? (fetch as unknown as FetchFn)
    const secret = clientSecret(cfg)

    const ex = await fetchFn('https://appleid.apple.com/auth/token', {
        method: 'POST', headers: HEADERS,
        body: form({ client_id: cfg.clientId, client_secret: secret, code: authorizationCode, grant_type: 'authorization_code' }),
    })
    const exBody = (await ex.json().catch(() => ({}))) as { refresh_token?: string }
    if (!ex.ok || !exBody.refresh_token) {
        console.warn('[account-delete] 애플 토큰 교환 실패', ex.status)
        return { revoked: false, reason: 'token_exchange_failed' }
    }

    const rv = await fetchFn('https://appleid.apple.com/auth/revoke', {
        method: 'POST', headers: HEADERS,
        body: form({ client_id: cfg.clientId, client_secret: secret, token: exBody.refresh_token, token_type_hint: 'refresh_token' }),
    })
    if (!rv.ok) {
        console.warn('[account-delete] 애플 토큰 취소 실패', rv.status)
        return { revoked: false, reason: 'revoke_failed' }
    }
    return { revoked: true }
}
