/* eslint-disable @typescript-eslint/no-explicit-any -- 시험용 가짜 DB */
import { describe, it, expect, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { saveAppleRefreshToken, readAppleRefreshToken, appleWebClientId } from '../apple-token'
import { revokeStoredAppleToken } from '../apple-revoke'
import { generateKeyPairSync } from 'node:crypto'

const KEY = randomBytes(32).toString('base64')
const env = { CONNECTOR_SECRET_KEY: KEY, APPLE_SIWA_CLIENT_ID: 'com.example.app', APPLE_SIWA_WEB_CLIENT_ID: 'com.example.web' } as any

function memDb() {
    const rows: any[] = []
    return {
        rows,
        db: {
            from: () => ({
                upsert: async (row: any) => { rows.splice(0, rows.length, row); return { error: null } },
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[0] ?? null, error: null }) }) }),
            }),
        } as any,
    }
}

describe('애플 열쇠 보관', () => {
    it('웹 Services ID 가 있으면 그걸, 없으면 앱 번들 ID', () => {
        expect(appleWebClientId(env)).toBe('com.example.web')
        expect(appleWebClientId({ APPLE_SIWA_CLIENT_ID: 'com.example.app' } as any)).toBe('com.example.app')
        expect(appleWebClientId({} as any)).toBeNull()
    })
    it('잠가서 저장하고(평문 아님) 다시 풀어 읽는다', async () => {
        const { db, rows } = memDb()
        expect(await saveAppleRefreshToken(db, 'u1', 'rt-secret', env)).toBe(true)
        expect(JSON.stringify(rows[0])).not.toContain('rt-secret')
        expect(rows[0].client_id).toBe('com.example.web')
        expect(await readAppleRefreshToken(db, 'u1', env)).toEqual({ refreshToken: 'rt-secret', clientId: 'com.example.web' })
    })
    it('잠글 열쇠가 없거나 토큰이 없으면 아무것도 저장하지 않고 던지지도 않는다', async () => {
        const { db, rows } = memDb()
        expect(await saveAppleRefreshToken(db, 'u1', 'rt', { APPLE_SIWA_CLIENT_ID: 'x' } as any)).toBe(false)
        expect(await saveAppleRefreshToken(db, 'u1', null, env)).toBe(false)
        expect(rows).toHaveLength(0)
    })
    it('DB 가 오류를 내도 던지지 않는다 (로그인은 막지 않는다)', async () => {
        const bad = { from: () => ({ upsert: async () => { throw new Error('db down') } }) } as any
        expect(await saveAppleRefreshToken(bad, 'u1', 'rt', env)).toBe(false)
    })
})

describe('보관한 열쇠로 애플 연결 끊기', () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
    const cfg = { keyId: 'KID', teamId: 'TEAM', clientId: 'com.example.app', privateKey: pem }

    it('저장한 clientId(웹 Services ID)로 revoke 만 부른다 (코드 교환 단계 없음)', async () => {
        const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
        const r = await revokeStoredAppleToken('rt-1', 'com.example.web', { config: cfg, fetchFn: fetchFn as any })
        expect(r).toEqual({ revoked: true })
        expect(fetchFn).toHaveBeenCalledTimes(1)
        const [url, init] = fetchFn.mock.calls[0] as any
        expect(url).toBe('https://appleid.apple.com/auth/revoke')
        const body = new URLSearchParams(init.body)
        expect(body.get('client_id')).toBe('com.example.web')
        expect(body.get('token')).toBe('rt-1')
        expect(body.get('token_type_hint')).toBe('refresh_token')
        const payload = JSON.parse(Buffer.from(body.get('client_secret')!.split('.')[1], 'base64url').toString())
        expect(payload.sub).toBe('com.example.web')
    })
    it('설정이 없으면 건너뛴다', async () => {
        expect(await revokeStoredAppleToken('rt', 'c', { config: null })).toEqual({ revoked: false, reason: 'not_configured' })
    })
    it('애플이 거절하면 revoke_failed', async () => {
        const fetchFn = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }))
        expect(await revokeStoredAppleToken('rt', 'c', { config: cfg, fetchFn: fetchFn as any })).toEqual({ revoked: false, reason: 'revoke_failed' })
    })
})
