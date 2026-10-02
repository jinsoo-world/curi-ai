import { describe, it, expect } from 'vitest'
import { parseRegisterBody, registerDevice, unregisterDevice, markOpened } from '../devices'

/** supabase 의 from(...).upsert/delete/update 사슬을 흉내 내고 부른 것을 적어 둔다 */
function fakeDb(error: { code?: string; message?: string } | null = null) {
    const calls: { table: string; op: string; args: unknown[]; filters: [string, unknown][] }[] = []
    const chain = (table: string, op: string, args: unknown[]) => {
        const rec = { table, op, args, filters: [] as [string, unknown][] }
        calls.push(rec)
        const q = {
            eq: (c: string, v: unknown) => { rec.filters.push([`eq:${c}`, v]); return q },
            in: (c: string, v: unknown) => { rec.filters.push([`in:${c}`, v]); return q },
            is: (c: string, v: unknown) => { rec.filters.push([`is:${c}`, v]); return q },
            then: (r: (v: { error: typeof error }) => unknown) => Promise.resolve({ error }).then(r),
        }
        return q
    }
    const db = {
        from: (table: string) => ({
            upsert: (...args: unknown[]) => chain(table, 'upsert', args),
            delete: (...args: unknown[]) => chain(table, 'delete', args),
            update: (...args: unknown[]) => chain(table, 'update', args),
        }),
    }
    return { db: db as never, calls }
}

const NOW = new Date('2026-10-02T05:00:00Z')

describe('기기 번호 등록 몸통 읽기', () => {
    it('아이폰: 번호는 소문자로, apnsEnv 가 없으면 production', () => {
        const r = parseRegisterBody({ platform: 'ios', token: 'ABCDEF0123456789', appVersion: '1.0.0', locale: 'ko-KR', timezone: 'Asia/Seoul' })
        expect(r).toEqual({ ok: true, value: { platform: 'ios', token: 'abcdef0123456789', apnsEnv: 'production', appVersion: '1.0.0', locale: 'ko-KR', timezone: 'Asia/Seoul' } })
    })
    it('아이폰 개발 빌드는 sandbox 로 받는다', () => {
        expect(parseRegisterBody({ platform: 'ios', token: 'abcdef0123456789', apnsEnv: 'sandbox' })).toMatchObject({ ok: true, value: { apnsEnv: 'sandbox' } })
    })
    it('안드로이드는 apnsEnv 를 무시하고 비운다, 번호 대소문자는 그대로', () => {
        expect(parseRegisterBody({ platform: 'android', token: 'fXy:APA91b-Ab_cd', apnsEnv: 'sandbox' }))
            .toMatchObject({ ok: true, value: { platform: 'android', token: 'fXy:APA91b-Ab_cd', apnsEnv: null } })
    })
    it('틀린 몸통은 거절한다', () => {
        expect(parseRegisterBody(null).ok).toBe(false)
        expect(parseRegisterBody({ platform: 'web', token: 'abcdef0123456789' }).ok).toBe(false)
        expect(parseRegisterBody({ platform: 'ios', token: '' }).ok).toBe(false)
        expect(parseRegisterBody({ platform: 'ios', token: 'abc def 0123456789' }).ok).toBe(false)
        expect(parseRegisterBody({ platform: 'ios', token: 'abcdef0123456789', apnsEnv: 'dev' }).ok).toBe(false)
    })
})

describe('기기 번호 등록 = 번호 기준 덮어쓰기', () => {
    it('같은 번호가 다른 사람 것이어도 지금 사람으로 옮기고 다시 켠다', async () => {
        const { db, calls } = fakeDb()
        const v = parseRegisterBody({ platform: 'ios', token: 'abcdef0123456789', apnsEnv: 'sandbox' })
        if (!v.ok) throw new Error('몸통')
        expect(await registerDevice(db, 'user-new', v.value, NOW)).toBeNull()
        expect(calls).toHaveLength(1)
        expect(calls[0].table).toBe('push_devices')
        expect(calls[0].op).toBe('upsert')
        expect(calls[0].args[0]).toMatchObject({ user_id: 'user-new', token: 'abcdef0123456789', apns_env: 'sandbox', disabled_at: null, last_seen_at: NOW.toISOString() })
        expect(calls[0].args[1]).toEqual({ onConflict: 'token' })
    })
    it('DB 오류는 그대로 돌려준다', async () => {
        const { db } = fakeDb({ code: '42P01', message: 'no table' })
        const v = parseRegisterBody({ platform: 'android', token: 'tok-12345678' })
        if (!v.ok) throw new Error('몸통')
        expect(await registerDevice(db, 'u', v.value)).toMatchObject({ code: '42P01' })
    })
})

describe('해제와 열림', () => {
    it('해제는 내 기기 번호만 지운다', async () => {
        const { db, calls } = fakeDb()
        await unregisterDevice(db, 'u1', 'ABCDEF0123456789')
        expect(calls[0]).toMatchObject({ table: 'push_devices', op: 'delete' })
        expect(calls[0].filters).toEqual([['eq:user_id', 'u1'], ['in:token', ['ABCDEF0123456789', 'abcdef0123456789']]])
    })
    it('열림은 내 기록에, 처음 누른 시각만', async () => {
        const { db, calls } = fakeDb()
        await markOpened(db, 'u1', 's-1', NOW)
        expect(calls[0]).toMatchObject({ table: 'push_sends', op: 'update', args: [{ opened_at: NOW.toISOString() }] })
        expect(calls[0].filters).toEqual([['eq:id', 's-1'], ['eq:user_id', 'u1'], ['is:opened_at', null]])
    })
})
