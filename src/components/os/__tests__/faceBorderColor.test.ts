import { describe, it, expect } from 'vitest'
import {
    accentScore, boostForBorder, borderCssFromHex, edgeBiasWeight, hexToRgb, isLikelySkin,
    pickAccentFromImageData, pickAccentFromSamples, rgbToHex, rgbToHsl, snapToBotColor,
    BOT_TOKEN_HEX,
} from '../faceBorderColor'

describe('faceBorderColor — 변환', () => {
    it('rgb ↔ hex 왕복', () => {
        expect(rgbToHex(255, 106, 26)).toBe('#FF6A1A')
        expect(hexToRgb('#22C55E')).toEqual({ r: 34, g: 197, b: 94 })
        expect(hexToRgb('bad')).toBeNull()
    })

    it('채도 부스트는 살색 베이지를 더 또렷하게 만든다', () => {
        const muddy = boostForBorder(210, 170, 140) // 탁한 살색
        const before = rgbToHsl(210, 170, 140)
        const after = rgbToHsl(muddy.r, muddy.g, muddy.b)
        expect(after.s).toBeGreaterThan(before.s)
    })
})

describe('faceBorderColor — 가중·피부', () => {
    it('모서리·가장자리 가중 > 가운데(얼굴)', () => {
        const center = edgeBiasWeight(24, 24, 48, 48)
        const edge = edgeBiasWeight(2, 24, 48, 48)
        const corner = edgeBiasWeight(1, 1, 48, 48)
        expect(edge).toBeGreaterThan(center)
        expect(corner).toBeGreaterThan(center)
        expect(corner).toBeGreaterThan(edge * 0.7)
    })

    it('살색 판별: 살구색은 true, 강한 초록/파랑은 false', () => {
        const skin = rgbToHsl(220, 170, 140)
        expect(isLikelySkin(skin.h, skin.s, skin.l)).toBe(true)
        const green = rgbToHsl(34, 197, 94)
        expect(isLikelySkin(green.h, green.s, green.l)).toBe(false)
        const blue = rgbToHsl(30, 111, 232)
        expect(isLikelySkin(blue.h, blue.s, blue.l)).toBe(false)
    })

    it('악센트 점수: 선명한 청록 > 살색 > 회색', () => {
        const teal = accentScore(31, 163, 138)
        const skin = accentScore(220, 170, 140)
        const gray = accentScore(140, 140, 140)
        expect(teal).toBeGreaterThan(skin)
        expect(skin).toBeGreaterThan(gray)
        expect(gray).toBe(0)
    })
})

describe('faceBorderColor — 픽커', () => {
    it('가장자리 파란 옷 + 가운데 살색이면 파란 계열 hex 를 고른다', () => {
        // 가운데는 살색, 가장자리는 파랑 — edge bias + skin downweight
        const samples = [
            { r: 220, g: 170, b: 140, weight: 0.2 }, // face
            { r: 220, g: 170, b: 140, weight: 0.2 },
            { r: 30, g: 90, b: 220, weight: 1.2 },   // clothing / bg
            { r: 40, g: 100, b: 230, weight: 1.1 },
            { r: 25, g: 80, b: 210, weight: 1.0 },
        ]
        const hex = pickAccentFromSamples(samples)
        expect(hex).toBeTruthy()
        const rgb = hexToRgb(hex!)!
        const { h, s } = rgbToHsl(rgb.r, rgb.g, rgb.b)
        expect(h).toBeGreaterThan(190)
        expect(h).toBeLessThan(270)
        expect(s).toBeGreaterThan(0.35)
    })

    it('초록 배경만 있으면 초록 계열', () => {
        const samples = Array.from({ length: 8 }, () => ({ r: 40, g: 180, b: 70, weight: 1 }))
        const hex = pickAccentFromSamples(samples)!
        const rgb = hexToRgb(hex)!
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
        expect(hsl.h).toBeGreaterThan(90)
        expect(hsl.h).toBeLessThan(160)
    })

    it('전부 회색·피부만이면 null (쓸 악센트 없음)', () => {
        expect(pickAccentFromSamples([
            { r: 128, g: 128, b: 128, weight: 1 },
            { r: 210, g: 170, b: 145, weight: 1 },
        ])).toBeNull()
    })

    it('ImageData: 가장자리 마젠타 띠 + 가운데 살색 → 마젠타 쪽', () => {
        const w = 16, h = 16
        const data = new Uint8ClampedArray(w * h * 4)
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4
                const edge = x < 2 || x >= w - 2 || y < 2 || y >= h - 2
                if (edge) {
                    data[i] = 224; data[i + 1] = 25; data[i + 2] = 123; data[i + 3] = 255
                } else {
                    data[i] = 215; data[i + 1] = 165; data[i + 2] = 135; data[i + 3] = 255
                }
            }
        }
        const hex = pickAccentFromImageData(data, w, h, 1)!
        const rgb = hexToRgb(hex)!
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
        // magenta-ish
        expect(hsl.h).toBeGreaterThan(280)
        expect(hsl.h).toBeLessThan(360)
        expect(hsl.s).toBeGreaterThan(0.35)
    })
})

describe('faceBorderColor — 토큰 스냅', () => {
    it('토큰과 거의 같으면 BotColor 로 스냅', () => {
        expect(snapToBotColor('#22C55E')).toBe('green')
        expect(snapToBotColor('#FF6A1A')).toBe('orange')
        expect(snapToBotColor('#112233', 20)).toBeNull()
    })

    it('borderCssFromHex: 스냅되면 CSS 변수, 아니면 hex, 없으면 폴백', () => {
        expect(borderCssFromHex(null, 'var(--봇-green)')).toBe('var(--봇-green)')
        expect(borderCssFromHex(BOT_TOKEN_HEX.blue, 'var(--봇-green)')).toBe('var(--봇-blue)')
        expect(borderCssFromHex('#AA33CC', 'var(--봇-green)')).toBe('#AA33CC')
    })
})
