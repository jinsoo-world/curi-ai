// 캐릭터(봇 아바타) 계산만 모아 둔 순수 함수. 화면(React), 움직임(CSS)은 여기 값을 받아 쓴다.
// 순수 함수라 vitest 로 바로 검사한다. 브라우저 물건(window, 문서)은 여기서 쓰지 않는다.

import type { BotColor, BotShape, BotState } from '@/domains/os/types'

/** 100×100 좌표계 안에서 눈 두 개의 자리. 도형마다 얼굴이 놓이는 곳이 다르다 */
export interface EyeLayout {
    lx: number      // 왼눈 가운데 x
    rx: number      // 오른눈 가운데 x
    cy: number      // 눈 가운데 y
    w: number       // 눈 너비 (세로로 긴 알약 모양)
    h: number       // 눈 높이
    dotsY: number   // 생각 중 점 3개가 놓이는 y (몸 위)
    workY: number   // 일하는 중 진행 점이 놓이는 y (몸 아래)
    zX: number      // 자는 중 「z」 시작 x (오른쪽 위)
    zY: number
}

const BASE: Omit<EyeLayout, 'lx' | 'rx' | 'cy'> = { w: 8, h: 18, dotsY: -4, workY: 104, zX: 78, zY: 18 }

/** 도형별 눈 자리. 클로버는 가운데 잎 사이(작은 심 위)에 조금 작게 */
export function eyeLayout(shape: BotShape): EyeLayout {
    switch (shape) {
        case 'circle': return { ...BASE, lx: 40, rx: 60, cy: 46 }
        case 'hex':    return { ...BASE, lx: 40, rx: 60, cy: 47 }
        case 'square': return { ...BASE, lx: 39, rx: 61, cy: 46 }
        case 'egg':    return { ...BASE, lx: 40, rx: 60, cy: 52 }            // 달걀은 아래가 넓어 얼굴이 조금 아래
        case 'drop':   return { ...BASE, lx: 41, rx: 59, cy: 62, zX: 74, zY: 30 } // 물방울은 꼭지 아래 넓은 곳
        case 'clover': return { ...BASE, lx: 43, rx: 57, cy: 50, w: 7, h: 15, zX: 76, zY: 22 }
    }
}

/** 화면 픽셀 기준 눈 두께. viewBox 100 을 size 로 늘리니 크기에 정비례한다 */
export function eyeThicknessPx(shape: BotShape, size: number): number {
    return (eyeLayout(shape).w / 100) * size
}

/** 「!」 배지, 리더 얼굴 배지의 픽셀 크기. 작은 아바타에서도 읽히는 최소값을 지킨다 */
export function badgePx(size: number): number {
    return Math.max(14, Math.round(size * 0.25))
}
export function facePx(size: number): number {
    return Math.max(14, Math.round(size * 0.4))
}

/** 도형, 색 → 한국어 (시연 페이지, 읽어 주기용) */
export const SHAPE_KO: Record<BotShape, string> = {
    circle: '원', hex: '육각', square: '둥근네모', egg: '달걀', drop: '물방울', clover: '네잎클로버',
}
export const COLOR_KO: Record<BotColor, string> = {
    orange: '주황', teal: '청록', magenta: '자홍', blue: '파랑', brown: '갈색', green: '연두', yellow: '노랑', white: '흰',
}

/** 상태 → 사람이 읽는 한국어. aria-label, 시연 페이지에 쓴다 */
export const STATE_KO: Record<BotState, string> = {
    idle: '쉬는 중',
    listening: '듣는 중',
    thinking: '생각 중',
    talking: '말하는 중',
    waiting_approval: '승인 기다림',
    working: '일하는 중',
    sleeping: '자는 중',
    error: '잠깐 쉬는 중(장애)',
}

/** 「답장봇, 생각 중」. 이름이 없으면 「봇, 생각 중」 */
export function ariaLabel(name: string | null | undefined, state: BotState): string {
    const who = (name ?? '').trim() || '봇'
    return `${who}, ${STATE_KO[state]}`
}

/** 눈을 자연스럽게 깜빡이는 상태. 나머지는 눈이 감겨 있거나(자는 중, 장애) 찡긋으로 대신한다(말하는 중) */
export const BLINK_STATES: ReadonlySet<BotState> = new Set<BotState>(['idle', 'listening', 'thinking', 'working', 'waiting_approval'])

export function shouldBlink(state: BotState): boolean {
    return BLINK_STATES.has(state)
}

/** 다음 깜빡임까지 기다릴 시간(ms) = 3~6초 불규칙. rand 는 0~1 (검사할 때 고정값을 넣는다) */
export function nextBlinkDelay(rand: number): number {
    const r = Math.min(Math.max(rand, 0), 0.999999)
    return Math.round(3000 + r * 3000)
}

/** 두 번 연속 깜빡일까. 다섯 번에 한 번쯤 */
export function isDoubleBlink(rand: number): boolean {
    return rand < 0.2
}

/** 말하는 중 몸이 늘었다 줄었다 하는 한 박자(ms) = 0.4~0.6초 랜덤 (글자 리듬) */
export function talkBeatMs(rand: number): number {
    const r = Math.min(Math.max(rand, 0), 0.999999)
    return Math.round(400 + r * 200)
}

/** 말하는 중 다음 찡긋까지(ms) = 1.2~3초 */
export function nextWinkDelay(rand: number): number {
    const r = Math.min(Math.max(rand, 0), 0.999999)
    return Math.round(1200 + r * 1800)
}

/** 장애: x x 를 보여 주는 시간. 이 뒤에 「– –」로 바뀐다 */
export const ERROR_X_MS = 600

/** 눈 모양 종류. 화면은 이 값으로 어떤 눈을 그릴지 정한다 */
export type EyeKind = 'open' | 'flat' | 'x'

/** 상태와 장애 단계(x 를 보여 주는 중인가)로 눈 모양을 정한다 */
export function eyeKind(state: BotState, errorShowingX: boolean): EyeKind {
    if (state === 'sleeping') return 'flat'
    if (state === 'error') return errorShowingX ? 'x' : 'flat'
    return 'open'
}

/** 몸 위, 아래 점을 그릴 상태 */
export function showsThinkDots(state: BotState): boolean { return state === 'thinking' }
export function showsWorkDots(state: BotState): boolean { return state === 'working' }
export function showsZ(state: BotState): boolean { return state === 'sleeping' }
export function showsBadge(state: BotState): boolean { return state === 'waiting_approval' }

/** 최상위 span 에 붙는 class 목록 (data-state 와 함께 CSS 가 읽는다) */
export function avatarClass(opts: { blinking: boolean; wink: 'L' | 'R' | null; faceUrl?: string | null }): string {
    const c = ['bot-avatar']
    if (opts.blinking) c.push('is-blinking')
    if (opts.wink === 'L') c.push('wink-left')
    if (opts.wink === 'R') c.push('wink-right')
    if (opts.faceUrl) c.push('has-face')
    return c.join(' ')
}
