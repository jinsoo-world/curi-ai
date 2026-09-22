import { describe, it, expect } from 'vitest'
import {
    ariaLabel, avatarClass, badgePx, eyeKind, eyeLayout, eyeThicknessPx, facePx,
    isDoubleBlink, nextBlinkDelay, nextWinkDelay, shouldBlink, talkBeatMs, STATE_KO, SHAPE_KO, COLOR_KO,
} from '../avatar'
import { SHAPES, COLORS } from '@/domains/os/presets'
import type { BotState } from '@/domains/os/types'

const ALL_STATES: BotState[] = ['idle', 'listening', 'thinking', 'talking', 'waiting_approval', 'working', 'sleeping', 'error']

describe('os/avatar — 눈 자리', () => {
    it('도형 6종 모두 눈이 몸 안(100×100)에 있고 왼눈이 오른눈보다 왼쪽이다', () => {
        for (const s of SHAPES) {
            const g = eyeLayout(s)
            expect(g.lx).toBeLessThan(g.rx)
            expect(g.lx - g.w / 2).toBeGreaterThan(0)
            expect(g.rx + g.w / 2).toBeLessThan(100)
            expect(g.cy - g.h / 2).toBeGreaterThan(0)
            expect(g.cy + g.h / 2).toBeLessThan(100)
        }
    })

    it('물방울은 꼭지 아래(눈이 더 아래), 클로버는 가운데 잎 사이(50)에 조금 작게', () => {
        expect(eyeLayout('drop').cy).toBeGreaterThan(eyeLayout('circle').cy)
        const c = eyeLayout('clover')
        expect(c.cy).toBe(50)
        expect(c.rx - c.lx).toBeLessThan(eyeLayout('circle').rx - eyeLayout('circle').lx)
        expect(c.w).toBeLessThan(eyeLayout('circle').w)
    })

    it('눈 두께는 크기에 정비례한다 (36→72 는 정확히 2배)', () => {
        expect(eyeThicknessPx('circle', 72)).toBeCloseTo(eyeThicknessPx('circle', 36) * 2)
        expect(eyeThicknessPx('circle', 96)).toBeCloseTo(eyeThicknessPx('circle', 44) * (96 / 44))
    })

    it('배지·얼굴은 작은 아바타에서도 14px 아래로 안 내려간다', () => {
        expect(badgePx(36)).toBe(14)
        expect(facePx(36)).toBe(14)
        expect(badgePx(96)).toBe(24)
        expect(facePx(72)).toBe(29)
    })
})

describe('os/avatar — 상태·글자', () => {
    it('aria-label 은 「이름, 상태」. 이름 없으면 「봇」', () => {
        expect(ariaLabel('답장봇', 'thinking')).toBe('답장봇, 생각 중')
        expect(ariaLabel('  ', 'sleeping')).toBe('봇, 자는 중')
        expect(ariaLabel(undefined, 'waiting_approval')).toBe('봇, 승인 기다림')
    })

    it('상태 8개·도형 6·색 8 전부 한국어 이름이 있다', () => {
        for (const s of ALL_STATES) expect(STATE_KO[s]).toBeTruthy()
        for (const s of SHAPES) expect(SHAPE_KO[s]).toBeTruthy()
        for (const c of COLORS) expect(COLOR_KO[c]).toBeTruthy()
    })

    it('눈 모양: 자는 중은 「– –」, 장애는 x x 뒤 「– –」, 나머지는 뜬 눈', () => {
        expect(eyeKind('sleeping', true)).toBe('flat')
        expect(eyeKind('error', true)).toBe('x')
        expect(eyeKind('error', false)).toBe('flat')
        expect(eyeKind('talking', true)).toBe('open')
    })

    it('깜빡이는 상태 = 쉬는·듣는·생각·일하는·승인. 자는·장애·말하는 중은 안 깜빡인다', () => {
        expect(shouldBlink('idle')).toBe(true)
        expect(shouldBlink('waiting_approval')).toBe(true)
        expect(shouldBlink('sleeping')).toBe(false)
        expect(shouldBlink('error')).toBe(false)
        expect(shouldBlink('talking')).toBe(false)
    })

    it('class 조립: 깜빡임·찡긋·얼굴 배지가 각각 붙는다', () => {
        expect(avatarClass({ blinking: false, wink: null })).toBe('bot-avatar')
        expect(avatarClass({ blinking: true, wink: 'L', faceUrl: 'x.png' })).toBe('bot-avatar is-blinking wink-left has-face')
        expect(avatarClass({ blinking: false, wink: 'R' })).toBe('bot-avatar wink-right')
    })
})

describe('os/avatar — 시간표(불규칙)', () => {
    it('깜빡임 간격은 3~6초, 두 번 연속은 다섯에 하나', () => {
        expect(nextBlinkDelay(0)).toBe(3000)
        expect(nextBlinkDelay(0.5)).toBe(4500)
        expect(nextBlinkDelay(1)).toBeLessThanOrEqual(6000)
        expect(nextBlinkDelay(1)).toBeGreaterThanOrEqual(5999)
        expect(isDoubleBlink(0.1)).toBe(true)
        expect(isDoubleBlink(0.5)).toBe(false)
    })

    it('말 리듬 한 박자는 0.4~0.6초, 찡긋 간격은 1.2~3초', () => {
        expect(talkBeatMs(0)).toBe(400)
        expect(talkBeatMs(1)).toBeLessThanOrEqual(600)
        expect(talkBeatMs(0.5)).toBe(500)
        expect(nextWinkDelay(0)).toBe(1200)
        expect(nextWinkDelay(1)).toBeLessThanOrEqual(3000)
    })
})
