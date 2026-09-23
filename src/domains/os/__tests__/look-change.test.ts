import { describe, it, expect, beforeEach } from 'vitest'
import {
    classifyLookChange,
    pickNoticeLine,
    pickReplyLine,
    pickNoticer,
    shouldPostLookBeat,
    markLookBeatPosted,
    LOOK_BEAT_COOLDOWN_MS,
    NOTICE_COLOR,
    NOTICE_SHAPE,
    NOTICE_BOTH,
    REPLY_LINES,
    _resetLookBeatCooldownForTests,
} from '../look-change'

describe('classifyLookChange', () => {
    it('색만 바뀌면 color', () => {
        expect(classifyLookChange({ color: 'teal' })).toBe('color')
    })
    it('모양만 바뀌면 shape', () => {
        expect(classifyLookChange({ shape: 'hex' })).toBe('shape')
    })
    it('둘 다면 both', () => {
        expect(classifyLookChange({ shape: 'egg', color: 'blue' })).toBe('both')
    })
    it('이름/인사만이면 null', () => {
        expect(classifyLookChange({})).toBeNull()
    })
})

describe('템플릿 풀', () => {
    it('색/모양/둘다/답장 풀이 충분히 많다', () => {
        expect(NOTICE_COLOR.length).toBeGreaterThanOrEqual(8)
        expect(NOTICE_SHAPE.length).toBeGreaterThanOrEqual(8)
        expect(NOTICE_BOTH.length).toBeGreaterThanOrEqual(6)
        expect(REPLY_LINES.length).toBeGreaterThanOrEqual(8)
    })
    it('가운뎃점이나 긴 줄표를 쓰지 않는다', () => {
        const all = [...NOTICE_COLOR, ...NOTICE_SHAPE, ...NOTICE_BOTH, ...REPLY_LINES]
        for (const s of all) {
            expect(s).not.toMatch(/[·—]/)
            expect(s.trim().length).toBeGreaterThan(0)
        }
    })
})

describe('pickNoticeLine / pickReplyLine', () => {
    it('rng 로 고정하면 같은 줄을 고른다', () => {
        const rng = () => 0
        expect(pickNoticeLine('color', rng)).toBe(NOTICE_COLOR[0])
        expect(pickNoticeLine('shape', rng)).toBe(NOTICE_SHAPE[0])
        expect(pickNoticeLine('both', rng)).toBe(NOTICE_BOTH[0])
        expect(pickReplyLine(rng)).toBe(REPLY_LINES[0])
    })
    it('종류마다 다른 풀에서 고른다', () => {
        const rng = () => 0
        expect(pickNoticeLine('color', rng)).not.toBe(pickNoticeLine('shape', rng))
    })
    it('여러 번 뽑으면 풀 안 값이 나온다', () => {
        let i = 0
        const rng = () => {
            const v = (i++ % NOTICE_COLOR.length) / NOTICE_COLOR.length
            return v
        }
        const seen = new Set<string>()
        for (let n = 0; n < NOTICE_COLOR.length; n++) seen.add(pickNoticeLine('color', rng))
        expect(seen.size).toBeGreaterThan(1)
    })
})

describe('pickNoticer', () => {
    it('다른 봇이 없으면 null', () => {
        expect(pickNoticer([])).toBeNull()
    })
    it('한 명이면 그 봇', () => {
        expect(pickNoticer([{ mentorId: 'm2' }], () => 0)).toEqual({ mentorId: 'm2' })
    })
    it('여러 명이면 rng 로 고른다', () => {
        const others = [{ mentorId: 'a' }, { mentorId: 'b' }, { mentorId: 'c' }]
        expect(pickNoticer(others, () => 0)?.mentorId).toBe('a')
        expect(pickNoticer(others, () => 0.99)?.mentorId).toBe('c')
    })
})

describe('shouldPostLookBeat — 빠른 토글 쿨다운', () => {
    const store = new Map<string, number>()
    beforeEach(() => store.clear())

    it('처음엔 올린다', () => {
        expect(shouldPostLookBeat('u1', 'm1', 1000, store)).toBe(true)
    })
    it('올린 직후엔 막는다', () => {
        markLookBeatPosted('u1', 'm1', 1000, store)
        expect(shouldPostLookBeat('u1', 'm1', 1000 + LOOK_BEAT_COOLDOWN_MS - 1, store)).toBe(false)
    })
    it('쿨다운이 지나면 다시 올린다', () => {
        markLookBeatPosted('u1', 'm1', 1000, store)
        expect(shouldPostLookBeat('u1', 'm1', 1000 + LOOK_BEAT_COOLDOWN_MS, store)).toBe(true)
    })
    it('다른 봇은 서로 막지 않는다', () => {
        markLookBeatPosted('u1', 'm1', 1000, store)
        expect(shouldPostLookBeat('u1', 'm2', 1000, store)).toBe(true)
    })
})

describe('_resetLookBeatCooldownForTests', () => {
    it('전역 맵을 비운다', () => {
        markLookBeatPosted('u', 'm', Date.now())
        _resetLookBeatCooldownForTests()
        expect(shouldPostLookBeat('u', 'm')).toBe(true)
    })
})
