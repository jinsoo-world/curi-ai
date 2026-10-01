/* eslint-disable @typescript-eslint/no-explicit-any -- 시험용 가짜 DB */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/domains/os/onboarding-server', () => ({
    ensureOnboardingRow: vi.fn(async () => true),
    attributeReferral: vi.fn(async () => ({ ok: true })),
}))

import { runAfterLogin, parseAppLoginBody } from '@/domains/auth/after-login'
import { ensureOnboardingRow, attributeReferral } from '@/domains/os/onboarding-server'

/** 아주 작은 가짜 DB: 표마다 돌려줄 값을 정하고, 쓰기 호출을 기록한다 */
function fakeDb(opts: { profile: Record<string, unknown> | null; giftDone?: boolean }) {
    const writes: { table: string; op: string; payload: unknown }[] = []
    const chain = (table: string) => {
        const q: any = {
            select: () => q, eq: () => q, is: () => q, limit: async () => ({ data: table === 'credit_transactions' && opts.giftDone ? [{ id: 1 }] : [] }),
            single: async () => ({ data: table === 'users' ? opts.profile : null, error: opts.profile ? null : { code: 'PGRST116', message: 'none' } }),
            insert: async (p: unknown) => { writes.push({ table, op: 'insert', payload: p }); return { error: null } },
            upsert: async (p: unknown) => { writes.push({ table, op: 'upsert', payload: p }); return { error: null } },
            update: (p: unknown) => { writes.push({ table, op: 'update', payload: p }); return q },
        }
        return q
    }
    return { writes, db: { from: chain, rpc: vi.fn(async () => ({ data: 100, error: null })) } }
}

const user = { id: 'u1', email: 'a@b.c', created_at: '2026-10-01T00:00:00Z', app_metadata: { provider: 'apple' }, user_metadata: { full_name: '김진' } }

describe('runAfterLogin', () => {
    beforeEach(() => vi.clearAllMocks())

    it('처음 오는 사람 = 가입 선물 + 회원 행 만들기 + 초대 귀속', async () => {
        const { db, writes } = fakeDb({ profile: null })
        const r = await runAfterLogin(db as any, user as any, { refCode: 'ABC', termsAt: '2026-10-01T08:00:00.000Z' })
        expect(r).toEqual({ isNewProfile: true, goOnboarding: true })
        expect(writes.some(w => w.table === 'credit_transactions' && w.op === 'insert')).toBe(true)
        expect(writes.some(w => w.table === 'users' && w.op === 'upsert')).toBe(true)
        expect(attributeReferral).toHaveBeenCalledWith(db, 'u1', 'ABC', 'link')
        expect(ensureOnboardingRow).toHaveBeenCalledWith(db, expect.objectContaining({ userId: 'u1', termsAt: '2026-10-01T08:00:00.000Z', provider: 'apple' }))
    })

    it('이미 있는 회원 = 회원 행을 새로 만들지 않고, 선물은 두 번 주지 않는다', async () => {
        const { db, writes } = fakeDb({ profile: { avatar_url: 'x', auth_provider: 'apple' }, giftDone: true })
        const r = await runAfterLogin(db as any, user as any, { refCode: null, termsAt: null })
        expect(r.isNewProfile).toBe(false)
        expect(writes.some(w => w.op === 'upsert')).toBe(false)
        expect(writes.some(w => w.table === 'credit_transactions')).toBe(false)
        expect(attributeReferral).not.toHaveBeenCalled()
    })
})

describe('parseAppLoginBody', () => {
    const now = Date.parse('2026-10-01T09:00:00Z')
    it('약관 동의 시각은 하루 안 값만 받는다', () => {
        expect(parseAppLoginBody({ termsAgreedAt: '2026-10-01T08:59:00Z' }, now).termsAt).toBe('2026-10-01T08:59:00.000Z')
        expect(parseAppLoginBody({ termsAgreedAt: '2026-09-28T08:59:00Z' }, now).termsAt).toBeNull()
        expect(parseAppLoginBody({ termsAgreedAt: '2026-10-01T09:30:00Z' }, now).termsAt).toBeNull()
        expect(parseAppLoginBody({ termsAgreedAt: '아무거나' }, now).termsAt).toBeNull()
    })
    it('애플이 첫 로그인 때 한 번 주는 이름은 앞뒤 공백을 떼고 40자까지', () => {
        expect(parseAppLoginBody({ displayName: '  김진  ' }, now).displayName).toBe('김진')
        expect(parseAppLoginBody({ displayName: 'a'.repeat(80) }, now).displayName).toHaveLength(40)
        expect(parseAppLoginBody({}, now).displayName).toBeNull()
    })
    it('이상한 값은 버린다', () => {
        expect(parseAppLoginBody(null, now)).toEqual({ termsAt: null, displayName: null, refCode: null })
        expect(parseAppLoginBody({ refCode: 123 }, now).refCode).toBeNull()
    })
})
