import { describe, it, expect } from 'vitest'
import { updateUserProfile } from '../actions'

function fakeDb(existing: string[]) {
    const state: { update: Record<string, unknown> | null } = { update: null }
    const db = {
        from: () => ({
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { interests: existing } }) }) }),
            update: (u: Record<string, unknown>) => { state.update = u; return { eq: async () => ({ error: null }) } },
        }),
    }
    return { db: db as never, state }
}

describe('프로필 저장 merge', () => {
    it('기본은 덮어쓴다(웹 동작 그대로)', async () => {
        const { db, state } = fakeDb(['a', 'b'])
        await updateUserProfile(db, 'u', { interests: ['c'] })
        expect(state.update!.interests).toEqual(['c'])
    })
    it('merge 면 합치고 중복은 한 번', async () => {
        const { db, state } = fakeDb(['a', 'b'])
        await updateUserProfile(db, 'u', { interests: ['b', 'c'] }, { mergeInterests: true })
        expect(state.update!.interests).toEqual(['a', 'b', 'c'])
    })
    it('merge 는 문자열만·30자·최대 30개로 거른다', async () => {
        const { db, state } = fakeDb([])
        const many = Array.from({ length: 40 }, (_, i) => `k${i}`)
        await updateUserProfile(db, 'u', { interests: [5, null, { a: 1 }, 'x'.repeat(50), ...many] as never }, { mergeInterests: true })
        const out = state.update!.interests as string[]
        expect(out).toHaveLength(30)
        expect(out.every(v => typeof v === 'string' && v.length <= 30)).toBe(true)
        expect(out[0]).toBe('x'.repeat(30))
    })
    it('merge 인데 interests 를 안 보내면 건드리지 않는다', async () => {
        const { db, state } = fakeDb(['a'])
        await updateUserProfile(db, 'u', { display_name: '민지' }, { mergeInterests: true })
        expect('interests' in state.update!).toBe(false)
    })
})
