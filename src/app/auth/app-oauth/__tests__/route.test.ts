// GET /auth/app-oauth — 앱 카카오·구글 로그인 시작 주소를 우리 도메인으로 보이게 하는 중계
import { describe, it, expect, beforeEach } from 'vitest'
import { GET } from '../route'

const SB = 'https://abc.supabase.co'
beforeEach(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = SB })

const call = (qs: string) => GET(new Request(`https://www.curi-ai.com/auth/app-oauth?${qs}`))
const base = 'redirect_to=' + encodeURIComponent('curiai://login-callback') + '&code_challenge=abc&code_challenge_method=s256'

describe('GET /auth/app-oauth', () => {
    it('카카오: 302 로 supabase authorize 에 같은 쿼리를 넘긴다', async () => {
        const res = await call(`provider=kakao&${base}&scopes=${encodeURIComponent('account_email profile_nickname')}&prompt=login`)
        expect(res.status).toBe(302)
        const loc = new URL(res.headers.get('location')!)
        expect(loc.origin + loc.pathname).toBe(`${SB}/auth/v1/authorize`)
        expect(loc.searchParams.get('provider')).toBe('kakao')
        expect(loc.searchParams.get('redirect_to')).toBe('curiai://login-callback')
        expect(loc.searchParams.get('code_challenge')).toBe('abc')
        expect(loc.searchParams.get('code_challenge_method')).toBe('s256')
        expect(loc.searchParams.get('scopes')).toBe('account_email profile_nickname')
        expect(loc.searchParams.get('prompt')).toBe('login')
    })

    it('구글도 허용', async () => {
        const res = await call(`provider=google&${base}`)
        expect(res.status).toBe(302)
    })

    it('다른 provider 는 400', async () => {
        expect((await call(`provider=github&${base}`)).status).toBe(400)
        expect((await call(base)).status).toBe(400)
    })

    it('redirect_to 가 curiai://login-callback 이 아니면 400 (열린 리디렉트 금지)', async () => {
        for (const bad of ['https://evil.com', 'curiai://login-callback/x', 'curiai://other', '']) {
            const res = await call(`provider=kakao&redirect_to=${encodeURIComponent(bad)}&code_challenge=abc`)
            expect(res.status).toBe(400)
        }
        expect((await call('provider=kakao&code_challenge=abc')).status).toBe(400)
    })

    it('허용 목록 밖 쿼리는 버린다', async () => {
        const res = await call(`provider=google&${base}&evil=1&skip_http_redirect=true`)
        const loc = new URL(res.headers.get('location')!)
        expect(loc.searchParams.has('evil')).toBe(false)
        expect(loc.searchParams.has('skip_http_redirect')).toBe(false)
    })

    it('code_challenge 가 없으면 400', async () => {
        const res = await call('provider=kakao&redirect_to=' + encodeURIComponent('curiai://login-callback'))
        expect(res.status).toBe(400)
    })

    it('supabase 주소 설정이 없으면 500', async () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL
        expect((await call(`provider=kakao&${base}`)).status).toBe(500)
    })
})
