// 왼쪽 명단 눈 뜨기/감기. 고른 봇(또는 그룹)만 눈을 뜨고, 30초 뒤 다시 반쯤 감는다.

import type { BotState } from './types'

/** 고른 뒤 눈을 뜬 채로 두는 시간 */
export const SIDEBAR_AWAKE_MS = 30_000

/** 대화 중이라 눈을 뜬 채로 둬야 하는 상태 (쉬는 중/자는 중은 제외) */
export function isBusyPresence(state: BotState | null | undefined): boolean {
    return !!state && state !== 'idle' && state !== 'sleeping'
}

/**
 * 명단 칸에 쓸 눈 상태.
 * - 고른 칸 + 대화 busy → 그 상태 그대로
 * - 고른 칸 + 깨어 있음 → listening (눈 뜸)
 * - 그 외 → sleeping (가로 줄 눈)
 */
export function sidebarEyeState(opts: {
    selected: boolean
    awake: boolean
    presence?: BotState | null
}): BotState {
    const { selected, awake, presence } = opts
    if (selected && isBusyPresence(presence)) return presence as BotState
    if (selected && awake) return 'listening'
    return 'sleeping'
}
