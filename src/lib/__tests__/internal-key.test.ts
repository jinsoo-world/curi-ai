import { describe, it, expect } from 'vitest'
import { internalKeyMatches, isInternalRequest, INTERNAL_KEY_HEADER } from '../internal-key'

describe('내부 열쇠 (x-internal-key)', () => {
    it('열쇠가 같으면 통과', () => {
        expect(internalKeyMatches('s3cret', 's3cret')).toBe(true)
    })
    it('다르거나 길이가 달라도 거절(던지지 않는다)', () => {
        expect(internalKeyMatches('s3creT', 's3cret')).toBe(false)
        expect(internalKeyMatches('s3cret-longer', 's3cret')).toBe(false)
    })
    it('서버 열쇠가 설정돼 있지 않으면 항상 거절', () => {
        expect(internalKeyMatches('', '')).toBe(false)
        expect(internalKeyMatches('x', undefined)).toBe(false)
    })
    it('머리글이 없으면 거절', () => {
        const req = { headers: new Headers() }
        expect(isInternalRequest(req, 's3cret')).toBe(false)
        req.headers.set(INTERNAL_KEY_HEADER, 's3cret')
        expect(isInternalRequest(req, 's3cret')).toBe(true)
    })
})
