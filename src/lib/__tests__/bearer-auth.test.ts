import { describe, it, expect, vi } from 'vitest'
import { bearerFromHeader, bindBearerToAuth } from '@/lib/supabase/bearer'

// 앱(iOS·안드로이드)은 쿠키가 없어서 「Authorization: Bearer <로그인 표시>」 로 보낸다 (2026-10-01)
describe('bearerFromHeader', () => {
    it('Bearer 뒤의 값을 꺼낸다', () => {
        expect(bearerFromHeader('Bearer abc.def.ghi')).toBe('abc.def.ghi')
        expect(bearerFromHeader('bearer   abc.def.ghi  ')).toBe('abc.def.ghi')
    })
    it('없거나 다른 방식이면 null', () => {
        expect(bearerFromHeader(null)).toBeNull()
        expect(bearerFromHeader('')).toBeNull()
        expect(bearerFromHeader('Basic dXNlcjpwdw==')).toBeNull()
        expect(bearerFromHeader('Bearer ')).toBeNull()
    })
    it('지나치게 긴 값은 받지 않는다', () => {
        expect(bearerFromHeader('Bearer ' + 'a'.repeat(9000))).toBeNull()
    })
})

describe('bindBearerToAuth', () => {
    it('인자 없이 getUser() 를 불러도 앱이 보낸 표시로 사용자를 확인한다', async () => {
        const getUser = vi.fn(async (jwt?: string) => ({ data: { user: jwt ? { id: 'u1' } : null }, error: null }))
        const client = { auth: { getUser } }
        bindBearerToAuth(client, 'tok')
        const res = await client.auth.getUser()
        expect(getUser).toHaveBeenCalledWith('tok')
        expect(res.data.user).toEqual({ id: 'u1' })
    })
    it('다른 표시를 직접 넘기면 그걸 쓴다', async () => {
        const getUser = vi.fn(async (jwt?: string) => ({ data: { user: { id: jwt } }, error: null }))
        const client = { auth: { getUser } }
        bindBearerToAuth(client, 'tok')
        await client.auth.getUser('other')
        expect(getUser).toHaveBeenCalledWith('other')
    })
})
