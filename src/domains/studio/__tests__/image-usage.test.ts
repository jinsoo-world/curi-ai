import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
import { capBlockText, imageCaps, IMAGE_CAP_TEXT_ADMIN, IMAGE_CAP_TEXT_GLOBAL } from '../image-usage'

describe('사진 하루 한도', () => {
    it('기본값은 어드민 30, 전체 200', () => {
        expect(imageCaps({})).toEqual({ global: 200, admin: 30 })
        expect(imageCaps({ IMAGE_GLOBAL_DAILY: '50', IMAGE_ADMIN_DAILY: '5' })).toEqual({ global: 50, admin: 5 })
        expect(imageCaps({ IMAGE_GLOBAL_DAILY: 'abc' })).toEqual({ global: 200, admin: 30 })
    })
    it('전체 한도는 모든 입구, 어드민 한도는 어드민 입구만', () => {
        const caps = { global: 200, admin: 30 }
        expect(capBlockText({ global: 199, admin: 29 }, caps, true)).toBeNull()
        expect(capBlockText({ global: 200 }, caps, false)).toBe(IMAGE_CAP_TEXT_GLOBAL)
        expect(capBlockText({ global: 10, admin: 30 }, caps, true)).toBe(IMAGE_CAP_TEXT_ADMIN)
        expect(capBlockText({ global: 10, admin: 30 }, caps, false)).toBeNull()
    })
    it('막는 말은 한 줄', () => {
        for (const t of [IMAGE_CAP_TEXT_ADMIN, IMAGE_CAP_TEXT_GLOBAL]) {
            expect(t.includes('\n')).toBe(false)
            expect(/[\u00B7\u2014\u2013]/.test(t)).toBe(false)
        }
    })
})
