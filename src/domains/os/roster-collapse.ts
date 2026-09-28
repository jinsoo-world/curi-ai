// 왼쪽 봇 명단 접기 (대표 지시 0928 「봇이 많으면 3×n 격자 + 더 보기」).
// 접혀 있으면 앞 6명만 보이고, 나머지는 「더 보기 (+N)」 단추로 편다. 편 뒤엔 「접기」.
// 규칙: 지금 고른 봇은 접혀 있어도 늘 보인다(앞 6명 밖이면 6번째 자리에 넣는다).
//       검색 중이면 접기와 상관없이 맞는 봇을 다 보인다. 편 상태는 세션 동안 기억한다(sessionStorage).

export const ROSTER_COLLAPSED_COUNT = 6
export const ROSTER_EXPANDED_KEY = 'os-roster-expanded'

export interface RosterCollapse<T> {
    /** 지금 그릴 봇 (순서 유지) */
    shown: T[]
    /** 접혀서 안 보이는 봇 수 (「더 보기 (+N)」의 N) */
    hiddenCount: number
    /** 더 보기/접기 단추를 보일지 */
    showToggle: boolean
}

export function collapseRoster<T>(
    bots: T[],
    opts: { expanded: boolean; searching: boolean; isCurrent?: (b: T) => boolean; limit?: number },
): RosterCollapse<T> {
    const limit = Math.max(1, opts.limit ?? ROSTER_COLLAPSED_COUNT)
    if (opts.searching) return { shown: bots, hiddenCount: 0, showToggle: false }
    if (bots.length <= limit) return { shown: bots, hiddenCount: 0, showToggle: false }
    if (opts.expanded) return { shown: bots, hiddenCount: 0, showToggle: true }

    const head = bots.slice(0, limit)
    const cur = opts.isCurrent ? bots.findIndex(opts.isCurrent) : -1
    const shown = cur >= limit ? [...bots.slice(0, limit - 1), bots[cur]] : head
    return { shown, hiddenCount: bots.length - shown.length, showToggle: true }
}

export function toggleLabel(expanded: boolean, hiddenCount: number): string {
    return expanded ? '접기' : `더 보기 (+${hiddenCount})`
}

type SessionLike = Pick<Storage, 'getItem' | 'setItem'>

export function readRosterExpanded(store: SessionLike | null | undefined): boolean {
    try { return store?.getItem(ROSTER_EXPANDED_KEY) === '1' } catch { return false }
}

export function writeRosterExpanded(store: SessionLike | null | undefined, expanded: boolean): void {
    try { store?.setItem(ROSTER_EXPANDED_KEY, expanded ? '1' : '0') } catch { /* 사생활 모드 등: 기억 못 해도 화면은 그대로 */ }
}
