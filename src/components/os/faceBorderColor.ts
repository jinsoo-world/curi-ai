// 사진 얼굴 테두리 색 = 사진에서 뽑은 강조색(배경·옷). 가운데 피부 평균이 되면 탁한 베이지가 되므로
// 가장자리·모서리를 더 보고, 피부 색조는 낮추고, 채도를 올려 링이 또렷한 악센트로 보이게 한다.
// 순수 계산은 여기, 캔버스 샘플·캐시는 extractFaceBorderColor. BotAvatar 는 stroke 만 갈아 낀다.

import type { BotColor } from '@/domains/os/types'

/** globals.css [data-theme="os"] 의 --봇-* 와 같다. 스냅용 */
export const BOT_TOKEN_HEX: Record<BotColor, string> = {
    orange: '#FF6A1A',
    teal: '#1FA38A',
    magenta: '#E0197B',
    blue: '#1E6FE8',
    brown: '#7A5230',
    green: '#22C55E',
    yellow: '#F5C518',
    white: '#F2F2F7',
}

export type Rgb = { r: number; g: number; b: number }
export type WeightedRgb = Rgb & { weight: number }

export function clamp01(n: number): number {
    return Math.max(0, Math.min(1, n))
}

export function rgbToHex(r: number, g: number, b: number): string {
    const to = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
    return `#${to(r)}${to(g)}${to(b)}`.toUpperCase()
}

export function hexToRgb(hex: string): Rgb | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
    if (!m) return null
    const n = parseInt(m[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** H 0..360, S/L 0..1 */
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
    const R = r / 255, G = g / 255, B = b / 255
    const max = Math.max(R, G, B), min = Math.min(R, G, B)
    const l = (max + min) / 2
    if (max === min) return { h: 0, s: 0, l }
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h = 0
    if (max === R) h = ((G - B) / d + (G < B ? 6 : 0)) / 6
    else if (max === G) h = ((B - R) / d + 2) / 6
    else h = ((R - G) / d + 4) / 6
    return { h: h * 360, s, l }
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
    const H = ((h % 360) + 360) % 360 / 360
    if (s === 0) {
        const v = Math.round(l * 255)
        return { r: v, g: v, b: v }
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const hue2rgb = (t: number) => {
        if (t < 0) t += 1
        if (t > 1) t -= 1
        if (t < 1 / 6) return p + (q - p) * 6 * t
        if (t < 1 / 2) return q
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
        return p
    }
    return {
        r: Math.round(hue2rgb(H + 1 / 3) * 255),
        g: Math.round(hue2rgb(H) * 255),
        b: Math.round(hue2rgb(H - 1 / 3) * 255),
    }
}

/**
 * 가장자리·모서리 가중. 가운데(대략 얼굴)는 낮춘다.
 * x,y 는 픽셀 좌표, w,h 는 이미지(또는 다운샘플) 크기.
 */
export function edgeBiasWeight(x: number, y: number, w: number, h: number): number {
    if (w <= 0 || h <= 0) return 0
    const nx = (x + 0.5) / w
    const ny = (y + 0.5) / h
    const dx = Math.abs(nx - 0.5) * 2 // 0 가운데 → 1 가장자리
    const dy = Math.abs(ny - 0.5) * 2
    const edge = Math.max(dx, dy)
    const corner = dx * dy
    const inFace = dx < 0.45 && dy < 0.45
    let weight = 0.12 + edge * 0.9 + corner * 0.55
    if (inFace) weight *= 0.22
    return weight
}

/** 살색 구간: 주황~살구 색조, 중간 채도·명도 */
export function isLikelySkin(h: number, s: number, l: number): boolean {
    const flesh = (h >= 0 && h <= 48) || h >= 345
    return flesh && s >= 0.08 && s <= 0.72 && l >= 0.18 && l <= 0.92
}

/** 클수록 「테두리에 쓰기 좋은」 악센트. 피부·회색·너무 밝/어두움은 0에 가깝다 */
export function accentScore(r: number, g: number, b: number): number {
    const { h, s, l } = rgbToHsl(r, g, b)
    if (l < 0.1 || l > 0.93) return 0
    if (s < 0.1) return 0
    let score = s * (1 - Math.abs(l - 0.48) * 0.7)
    if (isLikelySkin(h, s, l)) score *= 0.12
    score *= 0.45 + s
    return score
}

/** 뽑힌 색의 채도를 올려 링이 탁해지지 않게. 너무 어두/밝으면 살짝 보정 */
export function boostForBorder(r: number, g: number, b: number): Rgb {
    let { h, s, l } = rgbToHsl(r, g, b)
    s = clamp01(s * 1.35 + 0.08)
    if (l < 0.28) l = 0.28 + l * 0.4
    if (l > 0.78) l = 0.72
    l = clamp01(l)
    return hslToRgb(h, s, l)
}

/**
 * 가중 샘플 → 악센트 hex.
 * 점수×가중 상위 구간만 모아 평균한 뒤 채도 부스트. 쓸 만한 샘플이 없으면 null.
 */
export function pickAccentFromSamples(samples: WeightedRgb[]): string | null {
    if (samples.length === 0) return null

    type Scored = WeightedRgb & { score: number }
    const scored: Scored[] = []
    for (const p of samples) {
        if (p.weight <= 0) continue
        const score = accentScore(p.r, p.g, p.b)
        if (score <= 0) continue
        scored.push({ ...p, score })
    }
    if (scored.length === 0) return null

    scored.sort((a, b) => b.score * b.weight - a.score * a.weight)
    // 피부만 남은 사진(점수 매우 낮음)은 탁한 베이지 링이 되므로 폴백에 맡긴다
    if (scored[0].score < 0.08) return null
    const take = Math.max(1, Math.ceil(scored.length * 0.18))
    const top = scored.slice(0, take)

    let tw = 0, tr = 0, tg = 0, tb = 0
    for (const p of top) {
        const w = p.weight * p.score
        tw += w
        tr += p.r * w
        tg += p.g * w
        tb += p.b * w
    }
    if (tw <= 0) return null

    const boosted = boostForBorder(tr / tw, tg / tw, tb / tw)
    return rgbToHex(boosted.r, boosted.g, boosted.b)
}

/** ImageData(또는 동등 버퍼)에서 가장자리 가중 샘플 → hex */
export function pickAccentFromImageData(
    data: ArrayLike<number>,
    width: number,
    height: number,
    step = 2,
): string | null {
    if (width <= 0 || height <= 0 || data.length < width * height * 4) return null
    const samples: WeightedRgb[] = []
    const sx = Math.max(1, step)
    for (let y = 0; y < height; y += sx) {
        for (let x = 0; x < width; x += sx) {
            const i = (y * width + x) * 4
            const a = data[i + 3]
            if (a < 200) continue
            const weight = edgeBiasWeight(x, y, width, height)
            if (weight <= 0) continue
            samples.push({ r: data[i], g: data[i + 1], b: data[i + 2], weight })
        }
    }
    return pickAccentFromSamples(samples)
}

export function rgbDistance(a: Rgb, b: Rgb): number {
    const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b
    return Math.sqrt(dr * dr + dg * dg + db * db)
}

/** 토큰 색에 가까우면 그 BotColor 이름, 아니면 null (테마 일관성용, 선택) */
export function snapToBotColor(hex: string, maxDist = 42): BotColor | null {
    const rgb = hexToRgb(hex)
    if (!rgb) return null
    let best: BotColor | null = null
    let bestD = Infinity
    for (const [name, token] of Object.entries(BOT_TOKEN_HEX) as [BotColor, string][]) {
        const t = hexToRgb(token)
        if (!t) continue
        const d = rgbDistance(rgb, t)
        if (d < bestD) { bestD = d; best = name }
    }
    return best != null && bestD <= maxDist ? best : null
}

/** 스냅되면 CSS 변수, 아니면 추출 hex */
export function borderCssFromHex(hex: string | null | undefined, fallbackCss: string): string {
    if (!hex) return fallbackCss
    const snapped = snapToBotColor(hex)
    if (snapped) return `var(--봇-${snapped})`
    return hex
}

const SAMPLE_SIZE = 48
const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

/** 테스트·핫리로드용. 제품 코드는 보통 안 부른다 */
export function clearFaceBorderColorCache(): void {
    cache.clear()
    inflight.clear()
}

/**
 * URL 하나당 한 번만 샘플. CORS 실패·오염 캔버스면 null → 호출측이 var(--봇-*) 로 폴백.
 * 브라우저 전용(Image/canvas). SSR·node 에서는 null.
 */
export function extractFaceBorderColor(url: string): Promise<string | null> {
    if (!url) return Promise.resolve(null)
    if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null)
    const pending = inflight.get(url)
    if (pending) return pending

    const job = (async (): Promise<string | null> => {
        if (typeof Image === 'undefined' || typeof document === 'undefined') return null
        try {
            const img = await loadImageCors(url)
            const canvas = document.createElement('canvas')
            canvas.width = SAMPLE_SIZE
            canvas.height = SAMPLE_SIZE
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (!ctx) return null
            ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
            let pixels: ImageData
            try {
                pixels = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
            } catch {
                // tainted canvas (CORS)
                return null
            }
            return pickAccentFromImageData(pixels.data, SAMPLE_SIZE, SAMPLE_SIZE, 2)
        } catch {
            return null
        }
    })().then((hex) => {
        cache.set(url, hex)
        inflight.delete(url)
        return hex
    })

    inflight.set(url, job)
    return job
}

function loadImageCors(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error('face image load failed'))
        img.src = url
    })
}
