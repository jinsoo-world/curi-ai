// 공급자 등록표 14개와 OAuth 부품 — 인터넷·DB 없이 확인한다.
import { describe, it, expect } from 'vitest'
import { existsSync } from 'fs'
import { randomBytes } from 'crypto'
import path from 'path'
import { PROVIDERS, PROVIDER_IDS, findProvider, providerReady, providerView } from '../providers'
import {
    STATE_MAX_AGE_SEC, buildAuthUrl, exchangeCode, fetchAccountHint, maskAccount, pkcePair, randomState,
    redirectUri, signState, stateCookieName, verifyState, TokenExchangeFailed, extractAccessToken,
} from '../oauth'
import { CONNECTOR_INFO, CONNECTOR_KINDS, cleanKind, isReadyKind } from '../types'

const 자물쇠 = randomBytes(32)
const 환경 = { CONNECTOR_SECRET_KEY: 자물쇠.toString('base64') }

describe('공급자 등록표', () => {
    it('정확히 14개, 이름표가 겹치지 않는다', () => {
        expect(PROVIDERS).toHaveLength(14)
        expect(PROVIDER_IDS).toHaveLength(14)
        expect(new Set(PROVIDERS.map(p => p.id)).size).toBe(14)
        expect(PROVIDERS.map(p => p.id).sort()).toEqual([...PROVIDER_IDS].sort())
        // 대표 지시 13개 + 드라이브 동기화(갈래 G)로 늘어난 google_drive 가 전부 있다
        for (const id of ['notion', 'slack', 'kakao', 'gmail', 'google_calendar', 'google_drive', 'naver_calendar', 'naver_blog', 'zoom', 'threads', 'youtube', 'github', 'instagram', 'curious']) {
            expect(findProvider(id)?.id).toBe(id)
        }
    })

    it('로고 파일이 public/logos 에 전부 있다', () => {
        for (const p of PROVIDERS) {
            expect(p.logo.startsWith('/logos/')).toBe(true)
            expect(existsSync(path.join(process.cwd(), 'public', p.logo)), `${p.id} 로고`).toBe(true)
        }
    })

    it('화면 글자에 중간점·줄표가 없다', () => {
        for (const p of PROVIDERS) {
            for (const s of [p.name, p.hint, p.can]) {
                expect(s, `${p.id}: ${s}`).not.toMatch(/[·—]/)
            }
        }
    })

    it('열쇠 환경변수가 없으면 준비 중, 둘 다 있으면 준비됨. 큐리어스는 열쇠가 있어도 준비 중', () => {
        const google = findProvider('gmail')!
        expect(providerReady(google, 환경)).toBe(false)
        expect(providerView(google, 환경).missing).toContain('관리자')
        const 열쇠있음 = { ...환경, GOOGLE_OAUTH_CLIENT_ID: 'id', GOOGLE_OAUTH_CLIENT_SECRET: 'sec' }
        expect(providerReady(google, 열쇠있음)).toBe(true)
        expect(providerReady(findProvider('google_calendar')!, 열쇠있음)).toBe(true)   // 구글 4종은 같은 열쇠
        expect(providerReady(findProvider('youtube')!, 열쇠있음)).toBe(true)
        expect(providerReady(findProvider('google_drive')!, 열쇠있음)).toBe(true)
        // 자물쇠가 없으면 열쇠가 있어도 꺼진다
        expect(providerReady(google, { GOOGLE_OAUTH_CLIENT_ID: 'id', GOOGLE_OAUTH_CLIENT_SECRET: 'sec' })).toBe(false)
        const curious = findProvider('curious')!
        expect(providerReady(curious, { ...환경, CURIOUS_OAUTH_CLIENT_ID: 'a', CURIOUS_OAUTH_CLIENT_SECRET: 'b' })).toBe(false)
        expect(providerView(curious, 환경).comingSoon).toBe(true)
    })

    it('화면 모양(providerView)에 열쇠 이름·값이 안 들어간다', () => {
        const v = providerView(findProvider('github')!, { ...환경, GITHUB_CLIENT_ID: 'PUBLIC_ID', GITHUB_CLIENT_SECRET: 'TOP_SECRET' })
        expect(JSON.stringify(v)).not.toContain('TOP_SECRET')
        expect(JSON.stringify(v)).not.toContain('PUBLIC_ID')
        expect(JSON.stringify(v)).not.toContain('GITHUB_CLIENT')
    })

    it('connectors.kind 목록은 공급자와 같고, 손으로 붙이는 건 노션·슬랙만', () => {
        expect([...CONNECTOR_KINDS]).toEqual([...PROVIDER_IDS])
        expect(Object.keys(CONNECTOR_INFO)).toHaveLength(14)
        expect(cleanKind('gmail')).toBe('gmail')
        expect(cleanKind('twitter')).toBeNull()
        expect(isReadyKind('notion')).toBe(true)
        expect(isReadyKind('gmail')).toBe(false)
    })
})

describe('OAuth 로그인 주소', () => {
    it('client_id, redirect_uri, state, scope 가 들어가고 PKCE 공급자엔 challenge 가 붙는다', () => {
        const google = findProvider('gmail')!
        const u = new URL(buildAuthUrl(google, { clientId: 'cid', redirectUri: 'https://x/api/connect/gmail/callback', state: 'st', challenge: 'ch' }))
        expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
        expect(u.searchParams.get('client_id')).toBe('cid')
        expect(u.searchParams.get('redirect_uri')).toBe('https://x/api/connect/gmail/callback')
        expect(u.searchParams.get('state')).toBe('st')
        expect(u.searchParams.get('scope')).toContain('gmail.readonly')
        expect(u.searchParams.get('code_challenge')).toBe('ch')
        expect(u.searchParams.get('code_challenge_method')).toBe('S256')
        expect(u.searchParams.get('access_type')).toBe('offline')
    })

    it('PKCE 안 받는 공급자엔 challenge 를 안 보내고, scope 없는 공급자엔 scope 칸이 없다', () => {
        const github = new URL(buildAuthUrl(findProvider('github')!, { clientId: 'c', redirectUri: 'r', state: 's', challenge: 'ch' }))
        expect(github.searchParams.has('code_challenge')).toBe(false)
        expect(github.searchParams.get('scope')).toBe('read:user')
        const notion = new URL(buildAuthUrl(findProvider('notion')!, { clientId: 'c', redirectUri: 'r', state: 's' }))
        expect(notion.searchParams.has('scope')).toBe(false)
        expect(notion.searchParams.get('owner')).toBe('user')
        const slack = new URL(buildAuthUrl(findProvider('slack')!, { clientId: 'c', redirectUri: 'r', state: 's' }))
        expect(slack.searchParams.get('scope')).toBe('channels:read,channels:history,chat:write')
    })

    it('돌아오는 주소는 /api/connect/<id>/callback', () => {
        expect(redirectUri('https://curi-ai.vercel.app/', 'zoom')).toBe('https://curi-ai.vercel.app/api/connect/zoom/callback')
        expect(stateCookieName('zoom')).toBe('cx_oauth_zoom')
    })
})

describe('state 서명', () => {
    it('서명한 것을 그대로 되돌리고, 한 글자라도 바뀌면 null', () => {
        const s = { provider: 'gmail', state: randomState(), verifier: pkcePair().verifier, iat: 1_000_000 }
        const cookie = signState(s, 자물쇠)
        expect(verifyState(cookie, 자물쇠, 1_000_000 + 10)).toEqual(s)
        // 본문을 고친다
        const [body, sig] = cookie.split('.')
        const 고친본문 = Buffer.from(JSON.stringify({ ...s, provider: 'github' })).toString('base64url')
        expect(verifyState(`${고친본문}.${sig}`, 자물쇠, 1_000_000 + 10)).toBeNull()
        // 서명을 고친다
        expect(verifyState(`${body}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`, 자물쇠, 1_000_000 + 10)).toBeNull()
        // 다른 자물쇠
        expect(verifyState(cookie, randomBytes(32), 1_000_000 + 10)).toBeNull()
    })

    it('10분이 지나면 null, 모양이 틀리면 null', () => {
        const s = { provider: 'kakao', state: 'abc', iat: 1_000_000 }
        const cookie = signState(s, 자물쇠)
        expect(verifyState(cookie, 자물쇠, 1_000_000 + STATE_MAX_AGE_SEC - 1)).not.toBeNull()
        expect(verifyState(cookie, 자물쇠, 1_000_000 + STATE_MAX_AGE_SEC + 1)).toBeNull()
        expect(verifyState(undefined, 자물쇠)).toBeNull()
        expect(verifyState('', 자물쇠)).toBeNull()
        expect(verifyState('a.b.c', 자물쇠)).toBeNull()
        expect(verifyState('not-a-cookie', 자물쇠)).toBeNull()
    })

    it('state 와 PKCE 는 매번 다르다', () => {
        expect(randomState()).not.toBe(randomState())
        const a = pkcePair(), b = pkcePair()
        expect(a.verifier).not.toBe(b.verifier)
        expect(a.challenge).not.toBe(a.verifier)
        expect(a.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/)
    })
})

describe('토큰 받기·계정 힌트', () => {
    const 가짜fetch = (status: number, json: unknown, spy?: (url: string, init?: RequestInit) => void): typeof fetch =>
        (async (url: string | URL | Request, init?: RequestInit) => {
            spy?.(String(url), init)
            return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } })
        }) as typeof fetch

    it('본문 방식(구글)은 client_secret 이 본문에, Basic 방식(노션)은 머리글에 들어간다', async () => {
        let seen: { url: string; init?: RequestInit } | null = null
        const google = findProvider('gmail')!
        const t = await exchangeCode(google, { code: 'c', redirectUri: 'r', clientId: 'ID', clientSecret: 'SEC', verifier: 'ver' },
            가짜fetch(200, { access_token: 'AT', refresh_token: 'RT' }, (url, init) => { seen = { url, init } }))
        expect(t.access_token).toBe('AT')
        const body = String(seen!.init!.body)
        expect(body).toContain('client_secret=SEC')
        expect(body).toContain('code_verifier=ver')
        expect(body).toContain('grant_type=authorization_code')

        const notion = findProvider('notion')!
        await exchangeCode(notion, { code: 'c', redirectUri: 'r', clientId: 'ID', clientSecret: 'SEC' },
            가짜fetch(200, { access_token: 'AT' }, (url, init) => { seen = { url, init } }))
        const headers = seen!.init!.headers as Record<string, string>
        expect(headers.Authorization).toBe(`Basic ${Buffer.from('ID:SEC').toString('base64')}`)
        expect(String(seen!.init!.body)).not.toContain('client_secret')
    })

    it('네이버는 토큰 요청에 state 를 다시 넣는다', async () => {
        let body = ''
        await exchangeCode(findProvider('naver_blog')!, { code: 'c', redirectUri: 'r', clientId: 'i', clientSecret: 's', state: 'ST' },
            가짜fetch(200, { access_token: 'x' }, (_u, init) => { body = String(init?.body) }))
        expect(body).toContain('state=ST')
    })

    it('실패 응답·ok:false·access_token 없음은 TokenExchangeFailed 이고 문구에 열쇠가 없다', async () => {
        const p = findProvider('slack')!
        const args = { code: 'c', redirectUri: 'r', clientId: 'ID', clientSecret: 'TOP_SECRET' }
        await expect(exchangeCode(p, args, 가짜fetch(401, {}))).rejects.toBeInstanceOf(TokenExchangeFailed)
        await expect(exchangeCode(p, args, 가짜fetch(200, { ok: false, error: 'invalid_code' }))).rejects.toBeInstanceOf(TokenExchangeFailed)
        await expect(exchangeCode(p, args, 가짜fetch(200, { hello: 1 }))).rejects.toBeInstanceOf(TokenExchangeFailed)
        try { await exchangeCode(p, args, 가짜fetch(500, {})) } catch (e) {
            expect(String((e as Error).message)).not.toContain('TOP_SECRET')
        }
    })

    it('계정 힌트는 가려서 나온다(jin@… / 열정…)', async () => {
        expect(maskAccount('jin@mission-driven.kr')).toBe('jin@…')
        expect(maskAccount('a@b.c')).toBe('a@…')
        expect(maskAccount('열정진 대표')).toBe('열정진…')
        expect(maskAccount('ab')).toBe('ab…')
        expect(maskAccount('')).toBeNull()
        expect(maskAccount(null)).toBeNull()

        // 토큰 응답에서 바로(노션)
        const notionHint = await fetchAccountHint(findProvider('notion')!, { access_token: 'x', owner: { user: { person: { email: 'jin@mission-driven.kr' } } } }, 가짜fetch(200, {}))
        expect(notionHint).toBe('jin@…')
        // 「내 정보」 창구에서(깃허브)
        const ghHint = await fetchAccountHint(findProvider('github')!, { access_token: 'x' }, 가짜fetch(200, { login: 'jinsoo-world' }))
        expect(ghHint).toBe('jin…')
        // 창구가 실패해도 null 일 뿐 터지지 않는다
        expect(await fetchAccountHint(findProvider('zoom')!, { access_token: 'x' }, 가짜fetch(500, {}))).toBeNull()
        expect(await fetchAccountHint(findProvider('curious')!, { access_token: 'x' }, 가짜fetch(200, {}))).toBeNull()
    })
})

describe('풀린 열쇠에서 토큰 꺼내기', () => {
    it('토큰 JSON 이면 access_token, 손으로 붙인 값이면 그대로', () => {
        expect(extractAccessToken('{"access_token":"AT","refresh_token":"RT"}')).toBe('AT')
        expect(extractAccessToken('{"ok":true,"authed_user":{"access_token":"UAT"}}')).toBe('UAT')
        expect(extractAccessToken('ntn_손으로붙인토큰')).toBe('ntn_손으로붙인토큰')
        expect(extractAccessToken('https://hooks.slack.com/services/a/b/c')).toBe('https://hooks.slack.com/services/a/b/c')
        expect(extractAccessToken('{깨진 json')).toBe('{깨진 json')
    })
})
