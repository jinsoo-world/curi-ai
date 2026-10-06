import { describe, it, expect, vi, beforeEach } from 'vitest'

// 진짜 Supabase 는 부르지 않는다. createClient 에 넘긴 선택값만 본다.
const createClientMock = vi.fn((..._a: unknown[]) => ({ auth: {} }))
vi.mock('@supabase/supabase-js', () => ({ createClient: (...a: unknown[]) => createClientMock(...a) }))

import { timeoutFetch, DB_TIMEOUT_MS, AUTH_TIMEOUT_MS, DB_LONG_TIMEOUT_MS, timeoutForUrl } from '../timeout-fetch'
import { createAdminClient } from '../admin'

/** 신호가 끊길 때까지 영원히 기다리는 가짜 fetch */
function hangingFetch() {
    return vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_res, rej) => {
        init?.signal?.addEventListener('abort', () => rej(init.signal?.reason ?? new Error('aborted')))
    }))
}

describe('supabase 시간 제한 fetch', () => {
    beforeEach(() => {
        createClientMock.mockClear()
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://x.supabase.co')
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'srk')
    })

    it('응답이 안 오면 정해 둔 시간 뒤 끊는다(통째로 멈추지 않는다)', async () => {
        const base = hangingFetch()
        const f = timeoutFetch(30, { base })
        const started = Date.now()
        await expect(f('https://x.supabase.co/rest/v1/messages')).rejects.toBeTruthy()
        expect(Date.now() - started).toBeLessThan(1000)
    })

    it('로그인 확인(/auth/v1/) 은 더 짧은 시간을 쓴다', () => {
        expect(timeoutForUrl('https://x.supabase.co/auth/v1/user', DB_TIMEOUT_MS)).toBe(AUTH_TIMEOUT_MS)
        expect(timeoutForUrl('https://x.supabase.co/rest/v1/users', DB_TIMEOUT_MS)).toBe(DB_TIMEOUT_MS)
        expect(timeoutForUrl(new URL('https://x.supabase.co/auth/v1/user'), DB_LONG_TIMEOUT_MS)).toBe(AUTH_TIMEOUT_MS)
    })

    it('호출한 쪽이 넘긴 끊기 신호도 그대로 먹는다', async () => {
        const base = hangingFetch()
        const f = timeoutFetch(10_000, { base })
        const ctrl = new AbortController()
        const p = f('https://x.supabase.co/rest/v1/a', { signal: ctrl.signal })
        ctrl.abort(new Error('caller'))
        await expect(p).rejects.toThrow('caller')
    })

    it('제때 오면 그대로 돌려준다', async () => {
        const ok = new Response('[]', { status: 200 })
        const base = vi.fn(async () => ok)
        const f = timeoutFetch(1000, { base })
        await expect(f('https://x.supabase.co/rest/v1/a')).resolves.toBe(ok)
    })

    it('관리자 연결은 기본 5초, longRunning 이면 긴 시간', () => {
        createAdminClient()
        createAdminClient({ longRunning: true })
        const [a, b] = createClientMock.mock.calls.map(c => c[2] as { global?: { fetch?: unknown } })
        expect(typeof a.global?.fetch).toBe('function')
        expect(typeof b.global?.fetch).toBe('function')
        expect((a.global?.fetch as { timeoutMs?: number }).timeoutMs).toBe(DB_TIMEOUT_MS)
        expect((b.global?.fetch as { timeoutMs?: number }).timeoutMs).toBe(DB_LONG_TIMEOUT_MS)
    })
})
