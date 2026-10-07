// 인스타그램 연결 순수 부품 — 설정, state 서명, 메타 signed_request, 게시물 → 자료, 열쇠 연장 판단
import { describe, it, expect } from 'vitest'
import { createHmac, randomBytes } from 'crypto'
import {
    readInstagramConfig, instagramConnectEnabled, signIgState, verifyIgState, buildInstagramAuthUrl,
    verifySignedRequest, mediaToItems, shouldRefresh, isProfessional, INSTAGRAM_SCOPE, IG_STATE_MAX_AGE_SEC,
    REFRESH_MIN_AGE_MS, REFRESH_WINDOW_MS,
} from '../core'

const master = randomBytes(32)
const env = {
    INSTAGRAM_APP_ID: '123', INSTAGRAM_APP_SECRET: 'sek', INSTAGRAM_REDIRECT_URI: 'https://www.curi-ai.com/api/sns/instagram/callback',
    CONNECTOR_SECRET_KEY: randomBytes(32).toString('base64'),
}

describe('설정 읽기', () => {
    it('셋 다 있어야 켜진다. 하나라도 없으면 null', () => {
        expect(readInstagramConfig(env)).toEqual({ appId: '123', appSecret: 'sek', redirectUri: env.INSTAGRAM_REDIRECT_URI })
        expect(readInstagramConfig({ ...env, INSTAGRAM_APP_SECRET: '' })).toBeNull()
        expect(readInstagramConfig({ ...env, INSTAGRAM_APP_ID: undefined })).toBeNull()
        expect(readInstagramConfig({ ...env, INSTAGRAM_REDIRECT_URI: '  ' })).toBeNull()
    })
    it('돌아오는 주소는 https 만 (개발용 localhost 는 http 허용)', () => {
        expect(readInstagramConfig({ ...env, INSTAGRAM_REDIRECT_URI: 'http://evil.com/cb' })).toBeNull()
        expect(readInstagramConfig({ ...env, INSTAGRAM_REDIRECT_URI: 'http://localhost:3000/api/sns/instagram/callback' })).not.toBeNull()
        expect(readInstagramConfig({ ...env, INSTAGRAM_REDIRECT_URI: 'javascript:alert(1)' })).toBeNull()
    })
    it('기능 스위치 = 앱 설정 3개 + 연결 자물쇠', () => {
        expect(instagramConnectEnabled(env)).toBe(true)
        expect(instagramConnectEnabled({ ...env, CONNECTOR_SECRET_KEY: '' })).toBe(false)
        expect(instagramConnectEnabled({})).toBe(false)
    })
})

describe('state 서명', () => {
    const now = 1_800_000_000
    it('사용자·봇·출처를 담고 되돌린다', () => {
        const { state, nonce } = signIgState({ userId: 'u1', mentorId: 'm1', src: 'web' }, master, now)
        expect(state.startsWith('ig.')).toBe(true)
        expect(verifyIgState(state, master, now + 10)).toEqual({ u: 'u1', m: 'm1', n: nonce, src: 'web', iat: now })
    })
    it('앱은 비밀값 해시(proof)가 꼭 있어야 한다', () => {
        const pr = 'a'.repeat(64)
        const { state } = signIgState({ userId: 'u1', mentorId: 'm1', src: 'app', proof: pr }, master, now)
        expect(verifyIgState(state, master, now)?.pr).toBe(pr)
        expect(() => signIgState({ userId: 'u1', mentorId: 'm1', src: 'app' }, master, now)).toThrow()
        expect(() => signIgState({ userId: 'u1', mentorId: 'm1', src: 'app', proof: 'xyz' }, master, now)).toThrow()
    })
    it('10분 지나면, 서명이 다르면, 다른 열쇠면, 모양이 틀리면 null', () => {
        const { state } = signIgState({ userId: 'u1', mentorId: 'm1', src: 'web' }, master, now)
        expect(verifyIgState(state, master, now + IG_STATE_MAX_AGE_SEC + 1)).toBeNull()
        expect(verifyIgState(state, randomBytes(32), now)).toBeNull()
        const [p, body, sig] = state.split('.')
        const forged = Buffer.from(JSON.stringify({ u: 'attacker', m: 'm1', n: 'x', src: 'web', iat: now })).toString('base64url')
        expect(verifyIgState(`${p}.${forged}.${sig}`, master, now)).toBeNull()
        expect(verifyIgState(`${p}.${body}`, master, now)).toBeNull()
        expect(verifyIgState('app.' + body + '.' + sig, master, now)).toBeNull()
        expect(verifyIgState(null, master, now)).toBeNull()
    })
    it('커넥터 앱 state 서명 열쇠와 갈라져 있다(같은 마스터라도 서로 안 통한다)', async () => {
        const { newAppState } = await import('@/domains/connectors/app-state')
        const { state } = newAppState('u1', 'notion', master, 'a'.repeat(64), now)
        expect(verifyIgState(state.replace(/^app\./, 'ig.'), master, now)).toBeNull()
    })
})

describe('로그인 주소', () => {
    it('인스타그램 로그인 + instagram_business_basic 하나만', () => {
        const cfg = readInstagramConfig(env)!
        const u = new URL(buildInstagramAuthUrl(cfg, 'ig.s.t'))
        expect(u.origin + u.pathname).toBe('https://www.instagram.com/oauth/authorize')
        expect(u.searchParams.get('client_id')).toBe('123')
        expect(u.searchParams.get('redirect_uri')).toBe(env.INSTAGRAM_REDIRECT_URI)
        expect(u.searchParams.get('response_type')).toBe('code')
        expect(u.searchParams.get('scope')).toBe(INSTAGRAM_SCOPE)
        expect(INSTAGRAM_SCOPE).toBe('instagram_business_basic')
        expect(u.searchParams.get('state')).toBe('ig.s.t')
    })
})

describe('메타 signed_request', () => {
    const make = (payload: object, secret = 'sek') => {
        const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
        const sig = createHmac('sha256', secret).update(body).digest('base64url')
        return `${sig}.${body}`
    }
    it('앱 비밀값으로 서명이 맞으면 user_id 를 돌려준다', () => {
        expect(verifySignedRequest(make({ algorithm: 'HMAC-SHA256', user_id: '1789', issued_at: 1 }), 'sek')).toMatchObject({ userId: '1789' })
        expect(verifySignedRequest(make({ algorithm: 'HMAC-SHA256', user_id: 1789 }), 'sek')).toMatchObject({ userId: '1789' })
    })
    it('비밀값이 다르거나, 알고리즘이 다르거나, user_id 가 없거나, 모양이 틀리면 null', () => {
        expect(verifySignedRequest(make({ algorithm: 'HMAC-SHA256', user_id: '1' }, 'other'), 'sek')).toBeNull()
        expect(verifySignedRequest(make({ algorithm: 'none', user_id: '1' }), 'sek')).toBeNull()
        expect(verifySignedRequest(make({ algorithm: 'HMAC-SHA256' }), 'sek')).toBeNull()
        expect(verifySignedRequest('abc', 'sek')).toBeNull()
        expect(verifySignedRequest('', 'sek')).toBeNull()
        expect(verifySignedRequest(make({ algorithm: 'HMAC-SHA256', user_id: '1' }), '')).toBeNull()
    })
})

describe('게시물 → 자료', () => {
    const long = '오늘은 아침 루틴 이야기를 해 볼게요. 6시에 일어나서 물 한 잔.'
    it('글(캡션)만, 내 게시물 주소로, 같은 번호는 한 번만', () => {
        const r = mediaToItems([
            { id: '1', caption: long, media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/AAA/?igsh=x', timestamp: '2026-10-01T03:00:00+0000' },
            { id: '1', caption: long, media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/AAA/', timestamp: '2026-10-01T03:00:00+0000' },
            { id: '2', caption: long + ' 릴스', media_type: 'VIDEO', permalink: 'https://www.instagram.com/reel/BBB/', timestamp: '2026-09-30T03:00:00+0000' },
        ])
        expect(r.items).toHaveLength(2)
        expect(r.items[0]).toMatchObject({ url: 'https://www.instagram.com/p/AAA/', publishedAt: '2026-10-01T03:00:00.000Z' })
        expect(r.items[0].text).toContain('아침 루틴')
        expect(r.items[0].title.length).toBeLessThanOrEqual(60)
        expect(r.items[1].url).toBe('https://www.instagram.com/reel/BBB/')
        expect(r.items[0]).not.toHaveProperty('image')
    })
    it('글이 없거나 짧은 게시물은 뺀다(센다). 인스타그램 아닌 주소도 뺀다', () => {
        const r = mediaToItems([
            { id: '3', caption: '', media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/C/' },
            { id: '4', media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/D/' },
            { id: '5', caption: '좋아요', media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/E/' },
            { id: '6', caption: long, media_type: 'IMAGE', permalink: 'https://evil.com/p/F/' },
            { id: '7', caption: long, media_type: 'IMAGE' },
        ])
        expect(r.items).toHaveLength(0)
        expect(r.short).toBe(3)
    })
    it('글이 아주 길면 자른다', () => {
        const r = mediaToItems([{ id: '8', caption: '가'.repeat(30_000), media_type: 'IMAGE', permalink: 'https://www.instagram.com/p/G/' }])
        expect(r.items[0].text!.length).toBeLessThanOrEqual(20_000)
    })
})

describe('열쇠 연장 판단 (60일 열쇠: 24시간 지났고 15일 안에 끝날 때만)', () => {
    const now = Date.parse('2026-10-07T00:00:00Z')
    const iso = (ms: number) => new Date(ms).toISOString()
    it('조건', () => {
        expect(REFRESH_MIN_AGE_MS).toBe(24 * 3600_000)
        expect(REFRESH_WINDOW_MS).toBe(15 * 24 * 3600_000)
        const base = { status: 'connected', token_refreshed_at: iso(now - 2 * 86400_000), token_expires_at: iso(now + 10 * 86400_000) }
        expect(shouldRefresh(base, now)).toBe(true)
        expect(shouldRefresh({ ...base, token_refreshed_at: iso(now - 3600_000) }, now)).toBe(false)     // 24시간 안 지남
        expect(shouldRefresh({ ...base, token_expires_at: iso(now + 30 * 86400_000) }, now)).toBe(false) // 아직 넉넉
        expect(shouldRefresh({ ...base, token_expires_at: iso(now - 1000) }, now)).toBe(false)           // 이미 끝남 = 다시 연결
        expect(shouldRefresh({ ...base, status: 'needs_reconnect' }, now)).toBe(false)
        expect(shouldRefresh({ ...base, token_refreshed_at: null }, now)).toBe(true)
    })
})

describe('프로페셔널 계정', () => {
    it('비즈니스·크리에이터만', () => {
        expect(isProfessional('BUSINESS')).toBe(true)
        expect(isProfessional('MEDIA_CREATOR')).toBe(true)
        expect(isProfessional('CREATOR')).toBe(true)
        expect(isProfessional('PERSONAL')).toBe(false)
        expect(isProfessional(undefined)).toBe(false)
    })
})
