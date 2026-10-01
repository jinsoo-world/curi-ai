/* eslint-disable @typescript-eslint/no-explicit-any -- 시험용 가짜 DB */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
    CONFIRM_WORD, isConfirmed, storagePlan, deleteAccount, anonymousRef, parseDeleteBody,
} from '@/domains/account/delete'
import { revokeAppleTokens, appleConfigFromEnv } from '@/domains/account/apple-revoke'

type Call = { kind: 'select' | 'delete' | 'update' | 'storage-list' | 'storage-remove' | 'auth-delete'; target: string; detail?: unknown }

/** 부르는 순서를 기록하는 가짜 DB. fail 에 표 이름을 주면 그 표에서 오류를 돌려준다 */
function fakeDb(opts: {
    activeSub?: boolean
    mentorIds?: string[]
    creatorId?: string | null
    fail?: Record<string, { code: string; message?: string }>
    storage?: Record<string, string[]>   // `${bucket}/${folder}` → 파일 이름들
    authDeleteError?: { message: string; status?: number } | null
} = {}) {
    const calls: Call[] = []
    const failFor = (t: string) => opts.fail?.[t] ?? null
    const from = (table: string) => {
        let mode: Call['kind'] = 'select'
        let patch: unknown
        const q: any = {
            select: () => q,
            update: (p: unknown) => { mode = 'update'; patch = p; return q },
            delete: () => { mode = 'delete'; return q },
            eq: (_c: string, _v: unknown) => q,
            in: (_c: string, _v: unknown) => q,
            order: () => q,
            limit: () => q,
            maybeSingle: async () => {
                calls.push({ kind: 'select', target: table })
                if (table === 'creator_profiles') return { data: opts.creatorId === null ? null : { id: opts.creatorId ?? 'cp1' }, error: null }
                return { data: null, error: null }
            },
            then: (resolve: any) => {
                calls.push({ kind: mode, target: table, detail: patch })
                const f = failFor(table)
                if (mode === 'select' && table === 'subscriptions') {
                    return resolve({ data: opts.activeSub ? [{ id: 's1', status: 'active' }] : [], error: null })
                }
                if (mode === 'select' && table === 'mentors') {
                    return resolve({ data: (opts.mentorIds ?? []).map(id => ({ id })), error: null })
                }
                return resolve({ data: null, error: f ? { code: f.code, message: f.message ?? 'x' } : null })
            },
        }
        return q
    }
    const storage = {
        from: (bucket: string) => ({
            list: async (folder: string) => {
                calls.push({ kind: 'storage-list', target: `${bucket}/${folder}` })
                return { data: (opts.storage?.[`${bucket}/${folder}`] ?? []).map(name => ({ name })), error: null }
            },
            remove: async (paths: string[]) => {
                calls.push({ kind: 'storage-remove', target: bucket, detail: paths })
                return { data: null, error: null }
            },
        }),
    }
    const auth = {
        admin: {
            deleteUser: async (id: string) => {
                calls.push({ kind: 'auth-delete', target: id })
                return { error: opts.authDeleteError ?? null }
            },
        },
    }
    return { db: { from, storage, auth } as any, calls }
}

const user = { id: 'u1', email: 'a@b.c', provider: 'kakao' }
const idx = (calls: Call[], pred: (c: Call) => boolean) => calls.findIndex(pred)

describe('확인 단어', () => {
    it('「탈퇴」가 정확히 맞아야 통과', () => {
        expect(CONFIRM_WORD).toBe('탈퇴')
        expect(isConfirmed({ confirm: '탈퇴' })).toBe(true)
        expect(isConfirmed({ confirm: ' 탈퇴 ' })).toBe(true)
        expect(isConfirmed({ confirm: '탈퇴합니다' })).toBe(false)
        expect(isConfirmed({})).toBe(false)
        expect(isConfirmed(null)).toBe(false)
        expect(isConfirmed({ confirm: 1 })).toBe(false)
    })
    it('본문 해석: 애플 인증 코드는 문자열일 때만', () => {
        expect(parseDeleteBody({ confirm: '탈퇴', appleAuthorizationCode: 'abc' })).toEqual({ confirmed: true, appleAuthorizationCode: 'abc' })
        expect(parseDeleteBody({ confirm: '탈퇴', appleAuthorizationCode: 5 })).toEqual({ confirmed: true, appleAuthorizationCode: undefined })
        expect(parseDeleteBody('x')).toEqual({ confirmed: false, appleAuthorizationCode: undefined })
    })
})

describe('저장소 경로 계산', () => {
    it('회원 폴더 + 내가 만든 봇의 자료 폴더', () => {
        const plan = storagePlan('u1', ['m1', 'm2'])
        expect(plan).toEqual(expect.arrayContaining([
            { bucket: 'mentor-avatars', folder: 'u1' },
            { bucket: 'chat-images', folder: 'u1' },
            { bucket: 'tool-photos', folder: 'u1' },
            { bucket: 'mentor-files', folder: 'voice-samples/u1' },
            { bucket: 'avatars', folder: 'avatars', namePrefix: 'u1.' },
            { bucket: 'knowledge-files', folder: 'm1' },
            { bucket: 'knowledge-files', folder: 'm2' },
        ]))
        expect(plan.filter(p => p.bucket === 'knowledge-files')).toHaveLength(2)
    })
    it('봇이 없으면 자료 폴더 없음', () => {
        expect(storagePlan('u1', []).some(p => p.bucket === 'knowledge-files')).toBe(false)
    })
})

describe('익명 표식', () => {
    it('같은 사람은 같은 값, 원래 id 가 드러나지 않는다', () => {
        expect(anonymousRef('u1')).toBe(anonymousRef('u1'))
        expect(anonymousRef('u1')).not.toBe(anonymousRef('u2'))
        expect(anonymousRef('u1')).not.toContain('u1')
    })
})

describe('deleteAccount', () => {
    beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}))

    it('활성 구독이 있으면 아무것도 지우지 않고 막는다', async () => {
        const { db, calls } = fakeDb({ activeSub: true })
        const r = await deleteAccount(db, user)
        expect(r).toEqual({ ok: false, code: 'ACTIVE_SUBSCRIPTION', message: expect.stringContaining('구독') })
        expect(calls.some(c => c.kind === 'delete' || c.kind === 'update' || c.kind === 'auth-delete' || c.kind === 'storage-remove')).toBe(false)
    })

    it('순서: 결제기록 분리 -> 저장소 -> 하위 표 -> 봇 -> 크리에이터 프로필 -> 로그인 계정', async () => {
        const { db, calls } = fakeDb({ mentorIds: ['m1'], storage: { 'chat-images/u1': ['a.jpg'], 'knowledge-files/m1': ['k.pdf'] } })
        const r = await deleteAccount(db, user)
        expect(r).toEqual({ ok: true })
        const detach = idx(calls, c => c.kind === 'update' && c.target === 'credit_transactions')
        const storageRm = idx(calls, c => c.kind === 'storage-remove')
        const sessions = idx(calls, c => c.kind === 'delete' && c.target === 'chat_sessions')
        const knowledge = idx(calls, c => c.kind === 'delete' && c.target === 'knowledge_sources')
        const mentors = idx(calls, c => c.kind === 'delete' && c.target === 'mentors')
        const creator = idx(calls, c => c.kind === 'delete' && c.target === 'creator_profiles')
        const authDel = idx(calls, c => c.kind === 'auth-delete')
        expect(detach).toBeGreaterThan(-1)
        expect(detach).toBeLessThan(storageRm)
        expect(storageRm).toBeLessThan(sessions)
        expect(knowledge).toBeLessThan(mentors)
        expect(sessions).toBeLessThan(mentors)
        expect(mentors).toBeLessThan(creator)
        expect(creator).toBeLessThan(authDel)
        expect(authDel).toBe(calls.length - 1)
        // 결제·크레딧·구독은 지우지 않고 분리만 한다
        for (const t of ['credit_transactions', 'payments', 'subscriptions']) {
            expect(calls.some(c => c.kind === 'delete' && c.target === t)).toBe(false)
            const up = calls.find(c => c.kind === 'update' && c.target === t)
            expect(up?.detail).toMatchObject({ user_id: null, deleted_user_ref: anonymousRef('u1') })
        }
    })

    it('결제기록 분리가 실패하면(마이그레이션 미적용) 아무것도 지우지 않고 중단', async () => {
        const { db, calls } = fakeDb({ fail: { credit_transactions: { code: '23502', message: 'null value in column user_id' } } })
        await expect(deleteAccount(db, user)).rejects.toThrow()
        expect(calls.some(c => c.kind === 'delete' || c.kind === 'auth-delete' || c.kind === 'storage-remove')).toBe(false)
    })

    it('없는 표(42P01)는 건너뛰고 계속한다', async () => {
        const { db, calls } = fakeDb({ fail: { notifications: { code: '42P01' }, payments: { code: '42P01' } } })
        const r = await deleteAccount(db, user)
        expect(r).toEqual({ ok: true })
        expect(calls.some(c => c.kind === 'auth-delete')).toBe(true)
    })

    it('그 밖의 DB 오류는 로그인 계정을 지우기 전에 중단', async () => {
        const { db, calls } = fakeDb({ fail: { chat_sessions: { code: '57014', message: 'timeout' } } })
        await expect(deleteAccount(db, user)).rejects.toThrow(/chat_sessions/)
        expect(calls.some(c => c.kind === 'auth-delete')).toBe(false)
    })

    it('다시 불러도 안전: 지울 것이 없고 계정이 이미 없으면 성공', async () => {
        const { db } = fakeDb({ creatorId: null, authDeleteError: { message: 'User not found', status: 404 } })
        expect(await deleteAccount(db, user)).toEqual({ ok: true })
    })

    it('계정 삭제의 진짜 오류는 던진다', async () => {
        const { db } = fakeDb({ authDeleteError: { message: 'boom', status: 500 } })
        await expect(deleteAccount(db, user)).rejects.toThrow(/boom/)
    })

    it('애플 가입자: 설정이 없으면 취소 호출을 건너뛰고 삭제는 계속', async () => {
        const revoke = vi.fn(async () => ({ revoked: false as const, reason: 'not_configured' }))
        const { db } = fakeDb()
        const r = await deleteAccount(db, { ...user, provider: 'apple' }, { appleAuthorizationCode: 'code', revokeApple: revoke })
        expect(r).toEqual({ ok: true })
        expect(revoke).toHaveBeenCalledWith('code')
    })

    it('애플 취소가 던져도 탈퇴는 끝난다', async () => {
        const revoke = vi.fn(async () => { throw new Error('apple down') })
        const { db, calls } = fakeDb()
        const r = await deleteAccount(db, { ...user, provider: 'apple' }, { appleAuthorizationCode: 'code', revokeApple: revoke })
        expect(r).toEqual({ ok: true })
        expect(calls.some(c => c.kind === 'auth-delete')).toBe(true)
    })

    it('애플 가입자가 아니면 취소를 부르지 않는다', async () => {
        const revoke = vi.fn()
        const { db } = fakeDb()
        await deleteAccount(db, user, { appleAuthorizationCode: 'code', revokeApple: revoke as any })
        expect(revoke).not.toHaveBeenCalled()
    })
})

describe('애플 토큰 취소', () => {
    const full = { keyId: 'K', teamId: '2NS5S224QL', clientId: 'com.missiondriven.curiai', privateKey: '' }

    it('환경변수가 없으면 설정 없음 + 건너뜀(네트워크 호출 0)', async () => {
        expect(appleConfigFromEnv({} as any)).toBeNull()
        const fetchFn = vi.fn()
        const r = await revokeAppleTokens('code', { config: null, fetchFn: fetchFn as any })
        expect(r).toEqual({ revoked: false, reason: 'not_configured' })
        expect(fetchFn).not.toHaveBeenCalled()
    })

    it('환경변수 4개가 다 있어야 설정으로 인정, 줄바꿈 \\n 복원', () => {
        const env = { APPLE_SIWA_KEY_ID: 'K', APPLE_SIWA_TEAM_ID: 'T', APPLE_SIWA_CLIENT_ID: 'C', APPLE_SIWA_PRIVATE_KEY: 'a\\nb' } as any
        expect(appleConfigFromEnv(env)).toEqual({ keyId: 'K', teamId: 'T', clientId: 'C', privateKey: 'a\nb' })
        expect(appleConfigFromEnv({ ...env, APPLE_SIWA_KEY_ID: '' })).toBeNull()
    })

    it('인증 코드가 없으면 건너뜀', async () => {
        const fetchFn = vi.fn()
        const r = await revokeAppleTokens(undefined, { config: { ...full, privateKey: 'x' }, fetchFn: fetchFn as any })
        expect(r).toEqual({ revoked: false, reason: 'no_authorization_code' })
        expect(fetchFn).not.toHaveBeenCalled()
    })

    it('코드 -> refresh_token 교환 -> 취소 순서로 부른다', async () => {
        const { generateKeyPairSync } = await import('node:crypto')
        const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
        const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
        const fetchFn = vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ refresh_token: 'rt1' }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
        const r = await revokeAppleTokens('code1', { config: { ...full, privateKey: pem }, fetchFn: fetchFn as any })
        expect(r).toEqual({ revoked: true })
        expect(fetchFn.mock.calls[0][0]).toBe('https://appleid.apple.com/auth/token')
        expect(fetchFn.mock.calls[1][0]).toBe('https://appleid.apple.com/auth/revoke')
        const body1 = String(fetchFn.mock.calls[0][1].body)
        expect(body1).toContain('grant_type=authorization_code')
        expect(body1).toContain('code=code1')
        const body2 = String(fetchFn.mock.calls[1][1].body)
        expect(body2).toContain('token=rt1')
        expect(body2).toContain('token_type_hint=refresh_token')
    })

    it('교환이 실패하면 revoked false + 이유', async () => {
        const { generateKeyPairSync } = await import('node:crypto')
        const pem = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
        const fetchFn = vi.fn().mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) })
        const r = await revokeAppleTokens('bad', { config: { ...full, privateKey: pem }, fetchFn: fetchFn as any })
        expect(r).toEqual({ revoked: false, reason: 'token_exchange_failed' })
    })
})
