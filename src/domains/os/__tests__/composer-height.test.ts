import { describe, expect, it } from 'vitest'
import {
    COMPOSER_MAX_PX,
    COMPOSER_MIN_PX,
    clampComposerHeight,
} from '../composer-height'

describe('composer-height', () => {
    it('min 미만은 min 으로', () => {
        expect(clampComposerHeight(10)).toBe(COMPOSER_MIN_PX)
        expect(clampComposerHeight(0, 44, 180)).toBe(44)
    })

    it('max 초과는 max 로', () => {
        expect(clampComposerHeight(999)).toBe(COMPOSER_MAX_PX)
        expect(clampComposerHeight(500, 44, 180)).toBe(180)
    })

    it('중간 값은 그대로', () => {
        expect(clampComposerHeight(96, 44, 180)).toBe(96)
    })

    it('상수가 1줄~수 줄 범위', () => {
        expect(COMPOSER_MIN_PX).toBeGreaterThanOrEqual(32)
        expect(COMPOSER_MIN_PX).toBeLessThanOrEqual(56)
        expect(COMPOSER_MAX_PX).toBeGreaterThanOrEqual(140)
        expect(COMPOSER_MAX_PX).toBeLessThanOrEqual(220)
        expect(COMPOSER_MAX_PX).toBeGreaterThan(COMPOSER_MIN_PX)
    })

    it('비정상 입력은 min', () => {
        expect(clampComposerHeight(Number.NaN)).toBe(COMPOSER_MIN_PX)
        expect(clampComposerHeight(-20)).toBe(COMPOSER_MIN_PX)
    })
})
