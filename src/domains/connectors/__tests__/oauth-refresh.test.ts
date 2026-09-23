// 토큰 갱신(refresh_token → 새 access_token) — 구글 드라이브처럼 access_token 이 짧게 끊기는 공급자용.
// 인터넷 없이, 가짜 fetch 로 확인한다.
import { describe, it, expect } from 'vitest'
import { refreshAccessToken, TokenExchangeFailed } from '../oauth'
import { findProvider } from '../providers'
import { canAttemptRefresh } from '@/domains/os/cloudsync'

function 가짜fetch(status: number, body: unknown, capture?: (init: RequestInit) => void): typeof fetch {
    return (async (_url: string | URL, init?: RequestInit) => {
        capture?.(init ?? {})
        return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
    }) as typeof fetch
}

describe('refreshAccessToken — 토큰 갱신 분기', () => {
    const drive = findProvider('google_drive')!

    it('body 인증 공급자(구글)는 client_id/secret 을 본문에 넣는다', async () => {
        let seenBody = ''
        const fetchImpl = 가짜fetch(200, { access_token: 'NEW_AT', expires_in: 3600 }, init => { seenBody = String(init.body) })
        const out = await refreshAccessToken(drive, { refreshToken: 'RT', clientId: 'CID', clientSecret: 'CSEC' }, fetchImpl)
        expect(out.access_token).toBe('NEW_AT')
        expect(seenBody).toContain('grant_type=refresh_token')
        expect(seenBody).toContain('refresh_token=RT')
        expect(seenBody).toContain('client_id=CID')
        expect(seenBody).toContain('client_secret=CSEC')
    })

    it('basic 인증 공급자(Zoom)는 Authorization 머리글에 넣고, 본문엔 안 넣는다', async () => {
        const zoom = findProvider('zoom')!
        let seenAuth = ''
        let seenBody = ''
        const fetchImpl = 가짜fetch(200, { access_token: 'NEW_AT' }, init => {
            seenAuth = String((init.headers as Record<string, string>)?.Authorization ?? '')
            seenBody = String(init.body)
        })
        await refreshAccessToken(zoom, { refreshToken: 'RT', clientId: 'CID', clientSecret: 'CSEC' }, fetchImpl)
        expect(seenAuth).toBe(`Basic ${Buffer.from('CID:CSEC').toString('base64')}`)
        expect(seenBody).not.toContain('client_secret')
    })

    it('공급자가 오류로 답하면 TokenExchangeFailed', async () => {
        await expect(refreshAccessToken(drive, { refreshToken: 'RT', clientId: 'a', clientSecret: 'b' }, 가짜fetch(400, {}))).rejects.toBeInstanceOf(TokenExchangeFailed)
    })

    it('access_token 이 없는 응답도 실패로 본다', async () => {
        await expect(refreshAccessToken(drive, { refreshToken: 'RT', clientId: 'a', clientSecret: 'b' }, 가짜fetch(200, { ok: true }))).rejects.toBeInstanceOf(TokenExchangeFailed)
    })
})

describe('canAttemptRefresh — 다시 로그인을 시도해도 되나', () => {
    const drive = findProvider('google_drive')

    it('refresh_token 과 열쇠 2개가 다 있어야 시도한다', () => {
        expect(canAttemptRefresh({ refreshToken: 'RT', provider: drive, clientId: 'id', clientSecret: 'sec' })).toBe(true)
    })

    it('refresh_token 이 없으면 시도하지 않는다(재로그인 없이 바로 끊김 처리)', () => {
        expect(canAttemptRefresh({ refreshToken: '', provider: drive, clientId: 'id', clientSecret: 'sec' })).toBe(false)
    })

    it('공급자 열쇠(client id/secret)가 하나라도 없으면 시도하지 않는다', () => {
        expect(canAttemptRefresh({ refreshToken: 'RT', provider: drive, clientId: undefined, clientSecret: 'sec' })).toBe(false)
        expect(canAttemptRefresh({ refreshToken: 'RT', provider: drive, clientId: 'id', clientSecret: undefined })).toBe(false)
        expect(canAttemptRefresh({ refreshToken: 'RT', provider: null, clientId: 'id', clientSecret: 'sec' })).toBe(false)
    })
})
