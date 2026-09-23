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

/** 도형별 눈 자리. 두 눈 사이를 넓게(대표 0923 「눈이 좌우로 너무 몰렸다」, 예전 가운데 간격 20 → 30). 눈 크기는 기본값(w 8, 대표 0923 「눈이 너무 커서 부담」). 클로버는 가운데 심 위라 조금 작고 좁게 */
export function eyeLayout(shape: BotShape): EyeLayout {
    switch (shape) {
        case 'circle': return { ...BASE, lx: 35, rx: 65, cy: 46 }
        case 'hex':    return { ...BASE, lx: 35, rx: 65, cy: 47 }
        case 'square': return { ...BASE, lx: 34, rx: 66, cy: 46 }
        case 'egg':    return { ...BASE, lx: 35, rx: 65, cy: 52 }                       // 달걀은 아래가 넓어 얼굴이 조금 아래
        case 'drop':   return { ...BASE, lx: 36.5, rx: 63.5, cy: 63, zX: 74, zY: 30 }        // 물방울은 꼭지 아래 넓은 곳
        case 'clover': return { ...BASE, lx: 38.5, rx: 61.5, cy: 50, w: 7, h: 15, zX: 76, zY: 22 }
    }
}

/** 동그란 눈의 반지름(100 좌표계). 눈 너비 w 에 비례한다 */
export function eyeR(w: number): number {
    return w * 1.2
}

/** 두 눈 사이 빈 틈(테 바깥끼리). 0 이하면 눈이 붙어 보인다 */
export function eyeGap(g: EyeLayout): number {
    const r = eyeR(g.w)
    const rim = r + r * 0.13     // 테 두께 r*0.26 의 절반이 바깥으로 나온다
    return (g.rx - g.lx) - rim * 2
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

/** 눈을 감고 있는 시간(ms). 졸린 중엔 천천히, 나머지는 재빨리 */
export function blinkHoldMs(drowsy: boolean): number {
    return drowsy ? 320 : 120
}

/** 쉬는 중 이만큼 아무 말이 없으면 졸기 시작한다 (대표 0923 「5분 동안 말 안 걸면 스르륵」) */
export const IDLE_DROWSY_MS = 5 * 60 * 1000
/** 봇마다 0~20초 어긋나게 잔다. 시연 격자에서 여럿이 한꺼번에 감기지 않도록 */
export const DROWSY_JITTER_MS = 20_000

/** 졸음 시계. idleAfterMs + 무작위 지연(rand 0~1) 뒤 onDrowsy 를 한 번 부른다. 돌려주는 함수로 취소한다 */
export function startDrowsyTimer(idleAfterMs: number, rand: number, onDrowsy: () => void): () => void {
    const r = Math.min(Math.max(rand, 0), 0.999999)
    const t = setTimeout(onDrowsy, idleAfterMs + Math.round(r * DROWSY_JITTER_MS))
    return () => clearTimeout(t)
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
export function showsThinkDots(_state: BotState): boolean { return false }   // 머리 위 점 3개는 뺐다 (대표 0923 「말할 때 어색」)
export function showsWorkDots(state: BotState): boolean { return state === 'working' }
export function showsZ(state: BotState): boolean { return state === 'sleeping' }
export function showsBadge(state: BotState): boolean { return state === 'waiting_approval' }

/** 상태 → 오른쪽 위 동그라미 색 (대표: 초록=가능, 노랑=바쁨, 빨강=장애, 회색=잠) */
export type PresenceTone = 'green' | 'amber' | 'red' | 'gray'

export function presenceTone(state: BotState): PresenceTone {
    switch (state) {
        case 'idle':
        case 'listening':
        case 'talking':
            return 'green'
        case 'thinking':
        case 'working':
        case 'waiting_approval':
            return 'amber'
        case 'error':
            return 'red'
        case 'sleeping':
            return 'gray'
        default:
            return 'green'
    }
}

export function presenceLabel(tone: PresenceTone): string {
    switch (tone) {
        case 'green': return '가능'
        case 'amber': return '바쁨'
        case 'red': return '장애'
        case 'gray': return '잠'
    }
}


/** 사진 얼굴 —————————————————————————————————————————————
 * 봇에 프로필 사진이 있으면 그린 얼굴 대신 사진을 도형 안에 채운다(대표 0923 「있는 사진은 그걸 써. 생동감 있게」).
 * 불러오다 실패(onError)하면 faceError 가 true 로 바뀌어 여기서 false 가 되고, 그린 캐릭터 얼굴로 조용히 되돌아간다 */
export function showsFace(faceUrl: string | null | undefined, faceError: boolean): boolean {
    return Boolean(faceUrl) && !faceError
}

/** 사진을 도형 모양으로 자르는 clipPath id. 화면에 봇이 여럿이라 uid(useId) 로 서로 겹치지 않게 만든다 */
export function faceClipId(uid: string): string {
    return `${uid}-face-clip`
}

/** 사진 얼굴 테두리 두께(px). 칩(≤24) 1px, 작은 아바타(≤44) 2px, 그 위 3px.
 *  예전 ≤44→3px 는 18px 멘션 칩에서 초록 반달이 얼굴을 가렸다. */
export function faceBorderPx(size: number): number {
    if (size <= 24) return 1
    if (size <= 44) return 2
    return 3
}

/** 사진 얼굴이 쉬는 중일 때 갸웃거리는 간격(ms) = 6~9초. rand 는 0~1(검사할 때 고정값을 넣는다) */
export function faceTiltPeriodMs(rand: number): number {
    const r = Math.min(Math.max(rand, 0), 0.999999)
    return Math.round(6000 + r * 3000)
}

/** 사진 얼굴 + 생각 중일 때만 몸 아래에 점 3개(눈이 없어 위 점 대신 아래에 둔다) */
export function showsFaceThinkDots(hasFace: boolean, state: BotState): boolean {
    return hasFace && state === 'thinking'
}

/** 최상위 span 에 붙는 class 목록 (data-state 와 함께 CSS 가 읽는다) */
export function avatarClass(opts: { blinking: boolean; wink: 'L' | 'R' | null; drowsy?: boolean; faceUrl?: string | null }): string {
    const c = ['bot-avatar']
    if (opts.blinking) c.push('is-blinking')
    if (opts.drowsy) c.push('is-drowsy')
    if (opts.wink === 'L') c.push('wink-left')
    if (opts.wink === 'R') c.push('wink-right')
    if (opts.faceUrl) c.push('has-face')
    return c.join(' ')
}
