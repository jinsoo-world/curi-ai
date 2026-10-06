import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// 미들웨어가 Supabase 에 로그인 확인을 묻는지(getUser)만 본다
const getUser = vi.fn(async () => ({ data: { user: null } }))
const refreshSession = vi.fn(async () => ({ error: null }))
const createServerClient = vi.fn((..._a: unknown[]) => ({ auth: { getUser, refreshSession } }))
vi.mock('@supabase/ssr', () => ({ createServerClient: (...a: unknown[]) => createServerClient(...a) }))

import { updateSession, authCookieNeedsRefresh } from '../middleware'

describe('미들웨어 — 로그인 확인은 /profile·/admin 에서만', () => {
    beforeEach(() => {
        getUser.mockClear()
        refreshSession.mockClear()
        createServerClient.mockClear()
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
    })

    it('보통 화면(/, /chat/…)은 Supabase 를 부르지 않는다', async () => {
        const res = await updateSession(new NextRequest('https://curi.ai/chat/abc'))
        expect(getUser).not.toHaveBeenCalled()
        expect(res.status).toBe(200)
        await updateSession(new NextRequest('https://curi.ai/'))
        expect(getUser).not.toHaveBeenCalled()
    })

    it('/profile 은 확인하고, 로그인 안 했으면 로그인 화면으로 보낸다', async () => {
        const res = await updateSession(new NextRequest('https://curi.ai/profile'))
        expect(getUser).toHaveBeenCalledTimes(1)
        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toContain('/login')
    })

    it('/admin 도 확인한다', async () => {
        await updateSession(new NextRequest('https://curi.ai/admin/stats'))
        expect(getUser).toHaveBeenCalledTimes(1)
    })
})

const sess = (expSec: number) => 'base64-' + Buffer.from(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_at: expSec })).toString('base64url')

describe('미들웨어 — 로그인 표시가 곧 끝나면 화면 경로에서도 새로 받는다', () => {
    beforeEach(() => {
        getUser.mockClear()
        refreshSession.mockClear()
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon')
    })

    it('판정: 쿠키 없음 false · 넉넉함 false · 곧 끝남 true · 나뉜 쿠키도 읽음 · 못 읽으면 true', () => {
        const now = 1_000_000
        expect(authCookieNeedsRefresh([], now)).toBe(false)
        expect(authCookieNeedsRefresh([{ name: 'sb-abc-auth-token', value: sess(now + 3600) }], now)).toBe(false)
        expect(authCookieNeedsRefresh([{ name: 'sb-abc-auth-token', value: sess(now + 60) }], now)).toBe(true)
        const v = sess(now + 30)
        expect(authCookieNeedsRefresh([{ name: 'sb-abc-auth-token.1', value: v.slice(10) }, { name: 'sb-abc-auth-token.0', value: v.slice(0, 10) }], now)).toBe(true)
        expect(authCookieNeedsRefresh([{ name: 'sb-abc-auth-token', value: '???' }], now)).toBe(true)
        expect(authCookieNeedsRefresh([{ name: 'other', value: 'x' }], now)).toBe(false)
    })

    it('봇 상세 화면: 곧 끝나는 표시면 새로 받는다(쿠키 저장), 넉넉하면 안 부른다', async () => {
        const soon = new NextRequest('https://curi.ai/mentors/abc', { headers: { cookie: `sb-abc-auth-token=${sess(Math.floor(Date.now() / 1000) + 30)}` } })
        await updateSession(soon)
        expect(refreshSession).toHaveBeenCalledTimes(1)
        expect(getUser).not.toHaveBeenCalled()
        const fresh = new NextRequest('https://curi.ai/os/market/abc', { headers: { cookie: `sb-abc-auth-token=${sess(Math.floor(Date.now() / 1000) + 3600)}` } })
        await updateSession(fresh)
        expect(refreshSession).toHaveBeenCalledTimes(1)
    })
})
