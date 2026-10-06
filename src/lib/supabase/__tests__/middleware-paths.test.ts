import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// 미들웨어가 Supabase 에 로그인 확인을 묻는지(getUser)만 본다
const getUser = vi.fn(async () => ({ data: { user: null } }))
const createServerClient = vi.fn((..._a: unknown[]) => ({ auth: { getUser } }))
vi.mock('@supabase/ssr', () => ({ createServerClient: (...a: unknown[]) => createServerClient(...a) }))

import { updateSession } from '../middleware'

describe('미들웨어 — 로그인 확인은 /profile·/admin 에서만', () => {
    beforeEach(() => {
        getUser.mockClear()
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
