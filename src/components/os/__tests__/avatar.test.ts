import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
    ariaLabel, avatarClass, badgePx, blinkHoldMs, eyeGap, eyeKind, eyeLayout, eyeR, eyeThicknessPx, facePx,
    faceBorderPx, faceClipId, faceTiltPeriodMs, isDoubleBlink, nextBlinkDelay, nextWinkDelay, shouldBlink,
    showsFace, showsFaceThinkDots, startDrowsyTimer, talkBeatMs,
    DROWSY_JITTER_MS, IDLE_DROWSY_MS, STATE_KO, SHAPE_KO, COLOR_KO,
    presenceTone, presenceLabel,
} from '../avatar'
import BotAvatar from '../BotAvatar'
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

    it('두 눈은 서로 떨어져 있다(테끼리 틈 2 이상)이고 동그란 눈이 몸 안에 든다 (대표 0923 「눈이 너무 몰렸다」)', () => {
        for (const s of SHAPES) {
            const g = eyeLayout(s)
            const r = eyeR(g.w)
            expect(eyeGap(g)).toBeGreaterThanOrEqual(2)
            expect(g.lx - r * 1.13).toBeGreaterThan(10)   // 볼터치까지 몸 안(가장 좁은 육각 폭 10~90)
            expect(g.rx + r * 1.13).toBeLessThan(90)
        }
        expect(eyeLayout('circle').rx - eyeLayout('circle').lx).toBe(30)   // 예전 20 → 1.5배
        expect(eyeLayout('circle').w).toBe(8)                                // 눈 크기는 기본값 (대표 0923 「다 눈 기본값으로」)
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
        expect(avatarClass({ blinking: false, wink: null, drowsy: true })).toBe('bot-avatar is-drowsy')
    })
})

describe('os/avatar — 시간표(불규칙)', () => {
    it('눈 감고 있는 시간: 졸린 중은 천천히 320ms, 깨어 있으면 120ms', () => {
        expect(blinkHoldMs(true)).toBe(320)
        expect(blinkHoldMs(false)).toBe(120)
    })

    it('졸음 시계: 5분 + 봇마다 0~20초 뒤에 한 번 울리고, 취소하면 안 울린다', () => {
        vi.useFakeTimers()
        try {
            expect(IDLE_DROWSY_MS).toBe(5 * 60 * 1000)
            const onDrowsy = vi.fn()
            startDrowsyTimer(IDLE_DROWSY_MS, 0.5, onDrowsy)
            vi.advanceTimersByTime(IDLE_DROWSY_MS + DROWSY_JITTER_MS / 2 - 1)
            expect(onDrowsy).not.toHaveBeenCalled()
            vi.advanceTimersByTime(1)
            expect(onDrowsy).toHaveBeenCalledTimes(1)

            const cancelled = vi.fn()
            const cancel = startDrowsyTimer(IDLE_DROWSY_MS, 0, cancelled)
            cancel()   // 사용자가 말을 걸어 상태가 바뀜
            vi.advanceTimersByTime(IDLE_DROWSY_MS + DROWSY_JITTER_MS)
            expect(cancelled).not.toHaveBeenCalled()
        } finally {
            vi.useRealTimers()
        }
    })

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

describe('os/avatar — 사진 얼굴 (대표 0923 「있는 사진은 그걸 써」)', () => {
    it('사진이 있고 실패한 적 없으면 보여 준다. 실패(onError)하면 그린 얼굴로 되돌아간다', () => {
        expect(showsFace('https://x/a.png', false)).toBe(true)
        expect(showsFace('https://x/a.png', true)).toBe(false)   // onError 뒤 복귀
        expect(showsFace(null, false)).toBe(false)
        expect(showsFace(undefined, false)).toBe(false)
        expect(showsFace('', false)).toBe(false)
    })

    it('clipPath id 는 uid 마다 고유하다(한 화면에 봇이 여럿이라 겹치면 안 된다)', () => {
        expect(faceClipId('a')).toBe('a-face-clip')
        expect(faceClipId('b')).toBe('b-face-clip')
        expect(faceClipId('a')).not.toBe(faceClipId('b'))
    })

    it('테두리는 작은 아바타 3px, 큰 아바타 4px', () => {
        expect(faceBorderPx(18)).toBe(1)
        expect(faceBorderPx(24)).toBe(1)
        expect(faceBorderPx(36)).toBe(2)
        expect(faceBorderPx(44)).toBe(2)
        expect(faceBorderPx(72)).toBe(3)
        expect(faceBorderPx(96)).toBe(3)
    })

    it('갸웃 간격은 6~9초', () => {
        expect(faceTiltPeriodMs(0)).toBe(6000)
        expect(faceTiltPeriodMs(0.5)).toBe(7500)
        expect(faceTiltPeriodMs(1)).toBeLessThanOrEqual(9000)
        expect(faceTiltPeriodMs(1)).toBeGreaterThanOrEqual(8999)
    })

    it('사진 얼굴 + 생각 중일 때만 몸 아래 점 3개', () => {
        expect(showsFaceThinkDots(true, 'thinking')).toBe(true)
        expect(showsFaceThinkDots(true, 'idle')).toBe(false)
        expect(showsFaceThinkDots(false, 'thinking')).toBe(false)
    })

    it('faceUrl 을 안 넘기면 대표가 확정한 기존 캐릭터 그대로다 — 눈·볼터치·입은 있고 사진 얼굴 요소는 하나도 안 생긴다', () => {
        for (const state of ALL_STATES) {
            const html = renderToStaticMarkup(createElement(BotAvatar, { shape: 'circle', color: 'orange', state, size: 72 }))
            expect(html).toContain('eye-pos-left')
            expect(html).toContain('eye-pos-right')
            expect(html).not.toContain('has-face')
            expect(html).not.toContain('face-border')
            expect(html).not.toContain('face-clip')
            expect(html).not.toContain('badge-x')
        }
        // idle·talking 은 캐릭터가 그대로면 볼터치+입이 있어야 한다(장애만 미소를 감춘다, 기존 규칙)
        const idleHtml = renderToStaticMarkup(createElement(BotAvatar, { shape: 'circle', color: 'orange', state: 'idle', size: 72 }))
        expect(idleHtml).toContain('class="cute"')
        expect(idleHtml).toContain('class="mouth"')
    })
})



describe('BotAvatar faceRim — 사진 얼굴 테두리', () => {
    it('faceRim=shadow 이면 face-border 없고 face-rim-shadow 와 data-face-rim=shadow', () => {
        const html = renderToStaticMarkup(createElement(BotAvatar, {
            shape: 'circle', color: 'white', state: 'idle', size: 112,
            faceUrl: 'https://example.com/face.jpg', faceRim: 'shadow', name: '마켓봇',
        }))
        expect(html).toContain('has-face')
        expect(html).toContain('face-rim-shadow')
        expect(html).toContain('data-face-rim="shadow"')
        expect(html).not.toContain('face-border')
    })

    it('faceRim=none 이면 face-border 와 face-rim-shadow 둘 다 없다', () => {
        const html = renderToStaticMarkup(createElement(BotAvatar, {
            shape: 'circle', color: 'white', state: 'idle', size: 112,
            faceUrl: 'https://example.com/face.jpg', faceRim: 'none', name: '마켓봇',
        }))
        expect(html).toContain('data-face-rim="none"')
        expect(html).not.toContain('face-border')
        expect(html).not.toContain('face-rim-shadow')
    })

    it('faceRim 기본(color) 이면 face-border 가 있다', () => {
        const html = renderToStaticMarkup(createElement(BotAvatar, {
            shape: 'circle', color: 'blue', state: 'idle', size: 72,
            faceUrl: 'https://example.com/face.jpg', name: '명단봇',
        }))
        expect(html).toContain('face-border')
        expect(html).toContain('data-face-rim="color"')
        expect(html).not.toContain('face-rim-shadow')
    })
})

describe('presenceTone — 상태 동그라미 색', () => {
    it('가능=초록, 바쁨=노랑, 장애=빨강, 잠=회색', () => {
        expect(presenceTone('idle')).toBe('green')
        expect(presenceTone('listening')).toBe('green')
        expect(presenceTone('talking')).toBe('green')
        expect(presenceTone('thinking')).toBe('amber')
        expect(presenceTone('working')).toBe('amber')
        expect(presenceTone('waiting_approval')).toBe('amber')
        expect(presenceTone('error')).toBe('red')
        expect(presenceTone('sleeping')).toBe('gray')
        expect(presenceLabel('green')).toBe('가능')
    })
})
