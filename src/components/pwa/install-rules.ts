// 「앱으로 설치」 안내를 언제 보일지 (대표 승인 0928 사용성 10번).
// 첫 방문에는 안 띄운다. 두 번째 방문부터, 또는 첫 대화를 끝낸 뒤에 아래 작은 띠로 보인다. 하루 1번.
// 브라우저 저장소는 화면이 넘겨 준다(여기선 읽고 쓰는 규칙만).

export const INSTALL_KEYS = {
    shownOn: 'curi.installModal.shownOn',     // 오늘 이미 보였는가 (날짜 글자)
    installed: 'curi.installModal.installed', // 설치 끝 = 영영 안 뜸
    visits: 'curi.visits',                    // 방문 수 (세션마다 1씩)
    visitCounted: 'curi.visitCounted',        // 이 세션을 이미 셌는가 (sessionStorage)
    chatDone: 'curi.firstChatDone',           // 봇과 대화를 한 번이라도 끝냈는가
} as const

type Store = Pick<Storage, 'getItem' | 'setItem'>

function get(s: Store | null | undefined, k: string): string | null {
    try { return s?.getItem(k) ?? null } catch { return null }
}
function set(s: Store | null | undefined, k: string, v: string): void {
    try { s?.setItem(k, v) } catch { /* 저장이 막힌 브라우저면 그냥 넘어간다 */ }
}

/** 이번 세션을 방문 1번으로 센다(같은 세션에서 여러 번 불러도 1번). 센 뒤의 방문 수를 돌려준다 */
export function countVisit(local: Store | null | undefined, session: Store | null | undefined): number {
    const now = Number(get(local, INSTALL_KEYS.visits) ?? '0') || 0
    if (get(session, INSTALL_KEYS.visitCounted) === '1') return now
    set(session, INSTALL_KEYS.visitCounted, '1')
    set(local, INSTALL_KEYS.visits, String(now + 1))
    return now + 1
}

/** 봇 답을 끝까지 받았을 때 대화 화면이 부른다 */
export function markFirstChatDone(local: Store | null | undefined): void {
    set(local, INSTALL_KEYS.chatDone, '1')
}

export interface InstallGate {
    standalone: boolean
    installed: boolean
    shownToday: boolean
    visits: number
    chatDone: boolean
}

/** 설치 안내를 지금 보여도 되나 */
export function shouldShowInstall(g: InstallGate): boolean {
    if (g.standalone || g.installed || g.shownToday) return false
    return g.visits >= 2 || g.chatDone
}

/** 저장소에서 판정 재료를 읽는다 */
export function readInstallGate(local: Store | null | undefined, today: string, standalone: boolean, visits: number): InstallGate {
    return {
        standalone,
        installed: !!get(local, INSTALL_KEYS.installed),
        shownToday: get(local, INSTALL_KEYS.shownOn) === today,
        visits,
        chatDone: get(local, INSTALL_KEYS.chatDone) === '1',
    }
}
