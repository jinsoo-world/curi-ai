// 왼쪽 명단 눈 상태. 기본은 눈 뜸(idle). 고른 칸만 listening으로 더 또렷하게.

import type { BotState } from './types'

/** 고른 뒤 listening(눈 크게)을 유지하는 시간. 지나면 idle로 돌아가되 잠들지는 않음 */
export const SIDEBAR_AWAKE_MS = 30_000

/** 대화 중이라 그 상태 그대로 써야 하는 경우 (쉬는 중/자는 중은 제외) */
export function isBusyPresence(state: BotState | null | undefined): boolean {
    return !!state && state !== 'idle' && state !== 'sleeping'
}

/**
 * 명단 칸에 쓸 눈 상태.
 * - 고른 칸 + 대화 busy → 그 상태 그대로
 * - 고른 칸 + 깨어 있음 → listening (눈 더 크게, 생동감)
 * - 그 외(미선택, 또는 고른 뒤 타이머 만료) → idle (눈 뜸, 잠들지 않음)
 */
export function sidebarEyeState(opts: {
    selected: boolean
    awake: boolean
    presence?: BotState | null
}): BotState {
    const { selected, awake, presence } = opts
    if (selected && isBusyPresence(presence)) return presence as BotState
    if (selected && awake) return 'listening'
    return 'idle'
}
