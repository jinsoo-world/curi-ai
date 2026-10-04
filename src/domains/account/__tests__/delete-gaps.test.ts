/* eslint-disable @typescript-eslint/no-explicit-any -- 시험용 가짜 DB */
// 2026-10-05 실제 서버 시험에서 찾은 구멍: 봇이 있는 회원은 탈퇴가 500 으로 멈췄다(mentor_link_counts 는 표가 아니라 보기라 지울 수 없음).
import { describe, it, expect, vi } from 'vitest'

vi.mock('../apple-token', () => ({
    readAppleRefreshToken: vi.fn(async (_db: unknown, uid: string) => (uid === 'apple-web' ? { refreshToken: 'rt-1', clientId: 'com.example.web' } : null)),
}))
import { deleteAccount } from '../delete'

function fakeDb(mentorIds: string[] = ['m1']) {
    const deletes: string[] = []
    const updates: { table: string; patch: any }[] = []
    const from = (table: string) => {
        let mode = 'select'
        let patch: any
        const q: any = {
            select: () => q, eq: () => q, in: () => q, ilike: () => q, is: () => q, limit: () => q, order: () => q, lt: () => q,
            update: (p: any) => { mode = 'update'; patch = p; return q },
            delete: () => { mode = 'delete'; return q },
            upsert: () => { mode = 'upsert'; return q },
            maybeSingle: async () => ({ data: table === 'creator_profiles' ? { id: 'cp1' } : null, error: null }),
            then: (resolve: any) => {
                if (mode === 'delete') deletes.push(table)
                if (mode === 'update') updates.push({ table, patch })
                if (mode === 'select' && table === 'mentors') return resolve({ data: mentorIds.map(id => ({ id })), error: null })
                if (mode === 'select') return resolve({ data: [], error: null })
                // 보기(view)는 지울 수 없다. 실제 서버와 같은 오류
                if (mode === 'delete' && table === 'mentor_link_counts') return resolve({ data: null, error: { code: '55000', message: 'Views containing GROUP BY are not automatically updatable.' } })
                return resolve({ data: null, error: null })
            },
        }
        return q
    }
    const storage = { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ data: null, error: null }) }) }
    const auth = { admin: { deleteUser: async () => ({ error: null }) } }
    return { db: { from, storage, auth } as any, deletes, updates }
}

describe('탈퇴 구멍 막기', () => {
    it('봇이 있는 회원도 끝까지 간다: 보기(mentor_link_counts)는 지우려 하지 않는다', async () => {
        const { db, deletes } = fakeDb()
        const r = await deleteAccount(db, { id: 'u1', email: 'a@b.c', provider: 'kakao' })
        expect(r.ok).toBe(true)
        expect(deletes).not.toContain('mentor_link_counts')
        expect(deletes).toContain('mentors')
        expect(deletes).toContain('bot_links')
    })
    it('남던 표들도 지운다 (캠페인 발송 기록, 크레딧 옛 표, 동의 기록, 구독, 차단, 애플 열쇠)', async () => {
        const { db, deletes } = fakeDb([])
        await deleteAccount(db, { id: 'u1', email: 'a@b.c', provider: 'kakao' })
        for (const t of ['message_campaign_sends', 'credits', 'marketing_consent_log', 'ai_subscriptions', 'user_bot_blocks', 'apple_login_tokens', 'doc_page_usage']) {
            expect(deletes, t).toContain(t)
        }
    })
    it('SNS 보너스 중복 방지 열쇠는 지우지 않고 사람만 뗀다 (같은 블로그로 또 받는 것 막기)', async () => {
        const { db, deletes, updates } = fakeDb([])
        await deleteAccount(db, { id: 'u1', email: 'a@b.c', provider: 'kakao' })
        expect(deletes).not.toContain('sns_bonus_keys')
        expect(updates.find(u => u.table === 'sns_bonus_keys')?.patch).toEqual({ user_id: '00000000-0000-0000-0000-000000000000' })
    })
    it('애플(웹) 가입자: 로그인 때 보관한 열쇠가 있으면 그걸로 끊는다 (인증 코드 필요 없음)', async () => {
        const { db } = fakeDb([])
        const revokeStored = vi.fn(async () => ({ revoked: true as const }))
        const revokeApple = vi.fn(async () => ({ revoked: false as const, reason: 'no_authorization_code' as const }))
        const r = await deleteAccount(db, { id: 'apple-web', email: null, provider: 'apple' }, { revokeStored, revokeApple })
        expect(r.ok).toBe(true)
        expect(revokeStored).toHaveBeenCalledWith('rt-1', 'com.example.web')
        expect(revokeApple).not.toHaveBeenCalled()
    })
    it('애플(앱) 가입자: 보관한 열쇠가 없으면 앱이 보낸 인증 코드로 끊는다', async () => {
        const { db } = fakeDb([])
        const revokeStored = vi.fn()
        const revokeApple = vi.fn(async () => ({ revoked: true as const }))
        await deleteAccount(db, { id: 'apple-app', email: null, provider: 'apple' }, { appleAuthorizationCode: 'c1', revokeStored: revokeStored as any, revokeApple })
        expect(revokeApple).toHaveBeenCalledWith('c1')
        expect(revokeStored).not.toHaveBeenCalled()
    })
})
